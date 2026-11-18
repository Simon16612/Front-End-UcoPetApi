import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map, retry, switchMap, timer } from 'rxjs';

import { ModalFrame } from '../../shared/modal-frame';
import { PersonFields } from '../../person/person-fields/person-fields';
import { Doctor } from '../../../models/doctor/doctor.model';
import { Headquarter } from '../../../models/headquarter/headquarter.model';
import { PersonSummary } from '../../../models/person/person.model';
import { DoctorService } from '../../../services/doctor/doctor.service';
import { HeadquarterService } from '../../../services/headquarter/headquarter.service';
import { PersonLookupService } from '../../../services/person/person-lookup.service';
import { PersonService } from '../../../services/person/person.service';
import { SessionService } from '../../../services/session/session.service';
import { apiErrorMessage } from '../../../utils/shared/api-error';
import { personFieldsGroup, toPerson } from '../../../utils/person/form-rules';
import {
  UUID_RULES,
  licenseNumberRule,
  personName,
  shortId,
} from '../../../utils/doctor/form-rules';

const PERSON_SAVED_RETRIES = 8;
const PERSON_SAVED_DELAY_MS = 750;

type PersonSource = 'existing' | 'new';

@Component({
  selector: 'app-doctor-form',
  imports: [ReactiveFormsModule, ModalFrame, PersonFields],
  templateUrl: './doctor-form.html',
})
export class DoctorForm implements OnInit {
  private readonly doctorService = inject(DoctorService);
  private readonly personLookup = inject(PersonLookupService);
  private readonly personService = inject(PersonService);
  private readonly headquarterService = inject(HeadquarterService);
  private readonly session = inject(SessionService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly modal = inject(NgbActiveModal);

  protected readonly form = this.fb.group({
    idPerson: ['', UUID_RULES],
    licenseNumber: ['', licenseNumberRule],
    // Por defecto, la sede activa del menú superior.
    headquarterId: [this.session.headquarterId() ?? '', Validators.required],
  });
  protected readonly newPerson = personFieldsGroup(this.fb);
  protected readonly documentTypes = toSignal(this.personService.documentTypes(), {
    initialValue: [],
  });
  protected readonly source = signal<PersonSource>('existing');
  protected readonly step = signal<string | null>(null);
  protected readonly doctorId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly persons = signal<PersonSummary[]>([]);
  private readonly currentPerson = signal('');
  private readonly allHeadquarters = signal<Headquarter[]>([]);
  private readonly currentHeadquarterId = signal<string | null>(null);

  // Si la API deja leer personas se elige de una lista; si no, se pega el id.
  protected readonly canPick = computed(() => this.persons().length > 0);
  protected readonly options = computed(() => {
    const options = this.persons().map((person) => ({
      id: person.id,
      label: this.label(person),
    }));
    const current = this.currentPerson();
    if (current !== '' && !options.some((option) => option.id === current)) {
      options.unshift({ id: current, label: `Persona ${shortId(current)}…` });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  });

  // Solo sedes activas; si el médico ya está en una dada de baja, se conserva para poder verla.
  protected readonly headquarters = computed(() =>
    this.allHeadquarters()
      .filter(
        (headquarter) => headquarter.isActive || headquarter.id === this.currentHeadquarterId(),
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  ngOnInit(): void {
    this.personLookup.byId().subscribe((persons) => this.persons.set([...persons.values()]));
    this.headquarterService.list().subscribe({
      next: (headquarters) => this.allHeadquarters.set(headquarters),
      error: (error: HttpErrorResponse) =>
        this.error.set(apiErrorMessage(error, 'No se pudieron cargar las sedes')),
    });
  }

  edit(doctor: Doctor): void {
    this.doctorId.set(doctor.id ?? null);
    this.currentPerson.set(doctor.idPerson);
    this.currentHeadquarterId.set(doctor.headquarterId);
    this.form.patchValue({
      idPerson: doctor.idPerson,
      licenseNumber: doctor.licenseNumber,
      headquarterId: doctor.headquarterId,
    });
  }

  protected useSource(source: PersonSource): void {
    this.source.set(source);
    this.error.set(null);
    const idPerson = this.form.controls.idPerson;
    if (source === 'new') {
      idPerson.disable();
    } else {
      idPerson.enable();
    }
  }

  protected save(): void {
    const withNewPerson = this.source() === 'new';
    if (this.form.invalid || (withNewPerson && this.newPerson.invalid)) {
      this.form.markAllAsTouched();
      this.newPerson.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const doctorFor = (idPerson: string): Doctor => ({
      idPerson,
      licenseNumber: value.licenseNumber.trim(),
      headquarterId: value.headquarterId,
    });
    const id = this.doctorId();
    this.saving.set(true);
    this.error.set(null);
    let request: Observable<Doctor>;
    if (withNewPerson) {
      this.step.set('Registrando a la persona...');
      request = this.personService.create(toPerson(this.newPerson, false, true)).pipe(
        switchMap((person) => {
          this.step.set('Esperando a que el procesador guarde a la persona...');
          return this.waitUntilSaved(person.id as string);
        }),
        switchMap((personId) => {
          this.step.set('Registrando al médico...');
          const doctor = doctorFor(personId);
          return this.doctorService.create(doctor).pipe(map((saved) => ({ ...doctor, ...saved })));
        }),
      );
    } else {
      const doctor = doctorFor(value.idPerson.trim());
      request = (
        id ? this.doctorService.update(id, doctor) : this.doctorService.create(doctor)
      ).pipe(map((saved) => ({ ...doctor, ...saved })));
    }
    request.subscribe({
      next: (saved) => this.modal.close(saved),
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.step.set(null);
        this.error.set(apiErrorMessage(error, 'No se pudo guardar el médico'));
      },
    });
  }

  private waitUntilSaved(personId: string): Observable<string> {
    return this.personService.getById(personId).pipe(
      retry({ count: PERSON_SAVED_RETRIES, delay: () => timer(PERSON_SAVED_DELAY_MS) }),
      map(() => personId),
    );
  }

  protected invalid(field: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[field];
    return control.touched && control.invalid;
  }

  protected licenseMessage(): string {
    const errors = this.form.controls.licenseNumber.errors;
    if (errors?.['licenseLength']) {
      return 'La tarjeta profesional debe tener entre 4 y 30 caracteres';
    }
    if (errors?.['licenseChars']) {
      return 'Solo puede tener letras, números y guiones';
    }
    return 'La tarjeta profesional es obligatoria';
  }

  private label(person: PersonSummary): string {
    const name = personName(person) ?? `Persona ${shortId(person.id)}…`;
    return person.documentNumber ? `${name} · ${person.documentNumber}` : name;
  }
}