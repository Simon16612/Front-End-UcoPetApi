import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, map, retry, switchMap, timer } from 'rxjs';

import { ModalFrame } from '../../shared/modal-frame';
import { PersonFields } from '../../person/person-fields/person-fields';
import { PersonSummary } from '../../../models/person/person.model';
import { TutorPet } from '../../../models/tutor-pet/tutor-pet.model';
import { PersonLookupService } from '../../../services/person/person-lookup.service';
import { PersonService } from '../../../services/person/person.service';
import { TutorPetService } from '../../../services/tutor-pet/tutor-pet.service';
import { apiErrorMessage } from '../../../utils/shared/api-error';
import { personFieldsGroup, toPerson } from '../../../utils/person/form-rules';
import {
  TutorPetFormGroup,
  toTutorPetRequest,
  tutorPetFormGroup,
} from '../../../utils/tutor-pet/form-rules';
import { personName, shortId } from '../../../utils/doctor/form-rules';

const PERSON_SAVED_RETRIES = 8;
const PERSON_SAVED_DELAY_MS = 750;

type PersonSource = 'existing' | 'new';

@Component({
  selector: 'app-tutor-pet-form',
  imports: [ReactiveFormsModule, ModalFrame, PersonFields],
  templateUrl: './tutor-pet-form.html',
})
export class TutorPetForm implements OnInit {
  private readonly tutorPetService = inject(TutorPetService);
  private readonly personService = inject(PersonService);
  private readonly personLookup = inject(PersonLookupService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly modal = inject(NgbActiveModal);

  protected readonly form: TutorPetFormGroup = tutorPetFormGroup(this.fb);
  protected readonly newPerson = personFieldsGroup(this.fb);
  protected readonly documentTypes = toSignal(this.personService.documentTypes(), {
    initialValue: [],
  });
  protected readonly source = signal<PersonSource>('existing');
  protected readonly tutorPetId = signal<string | null>(null);
  protected readonly persons = signal<PersonSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly step = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly currentPerson = signal('');

  protected readonly options = computed(() => {
    const options = this.persons()
      .filter((person) => person.active !== false)
      .map((person) => ({ id: person.id, label: this.label(person) }));
    const current = this.currentPerson();
    if (current !== '' && !options.some((option) => option.id === current)) {
      const person = this.persons().find((candidate) => candidate.id === current);
      options.unshift({
        id: current,
        label: person ? `${this.label(person)} · Inactiva` : `Persona ${shortId(current)}…`,
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  });

  ngOnInit(): void {
    this.personLookup.refresh();
    this.personLookup.byIdStrict().subscribe({
      next: (persons) => {
        this.persons.set([...persons.values()]);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(error, 'No se pudieron cargar las personas'));
      },
    });
  }

  edit(tutor: TutorPet): void {
    this.tutorPetId.set(tutor.id);
    this.currentPerson.set(tutor.person);
    this.form.patchValue({ person: tutor.person });
  }

  protected useSource(source: PersonSource): void {
    this.source.set(source);
    this.error.set(null);
  }

  protected save(): void {
    if (this.source() === 'new') {
      this.saveWithNewPerson();
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const id = this.tutorPetId();
    const request = toTutorPetRequest(this.form);
    this.start('Guardando el tutor...');
    (id
      ? this.tutorPetService.update(id, request)
      : this.tutorPetService.create(request)
    ).subscribe({
      next: (saved) => this.modal.close(saved),
      error: (error: HttpErrorResponse) => this.fail(error, 'No se pudo guardar el tutor'),
    });
  }

  private saveWithNewPerson(): void {
    if (this.newPerson.invalid) {
      this.newPerson.markAllAsTouched();
      return;
    }
    this.start('Registrando a la persona...');
    this.personService
      .create(toPerson(this.newPerson, false, true))
      .pipe(
        switchMap((person) => {
          this.step.set('Esperando a que el procesador guarde a la persona...');
          return this.waitUntilSaved(person.id as string);
        }),
        switchMap((personId) => {
          this.step.set('Asociando a la persona como tutor...');
          return this.tutorPetService.create({ person: personId });
        }),
      )
      .subscribe({
        next: (saved) => this.modal.close(saved),
        error: (error: HttpErrorResponse) =>
          this.fail(error, 'No se pudo registrar a la persona como tutor'),
      });
  }

  private waitUntilSaved(personId: string): Observable<string> {
    return this.personService.getById(personId).pipe(
      retry({ count: PERSON_SAVED_RETRIES, delay: () => timer(PERSON_SAVED_DELAY_MS) }),
      map(() => personId),
    );
  }

  private start(step: string): void {
    this.saving.set(true);
    this.step.set(step);
    this.error.set(null);
  }

  private fail(error: HttpErrorResponse, fallback: string): void {
    this.saving.set(false);
    this.step.set(null);
    this.error.set(apiErrorMessage(error, fallback));
  }

  protected invalid(): boolean {
    const control = this.form.controls.person;
    return control.touched && control.invalid;
  }

  private label(person: PersonSummary): string {
    const name = personName(person) ?? `Persona ${shortId(person.id)}…`;
    return person.documentNumber ? `${name} · ${person.documentNumber}` : name;
  }
}
