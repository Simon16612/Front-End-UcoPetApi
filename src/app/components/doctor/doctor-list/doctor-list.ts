import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { SessionService } from '../../../services/session/session.service';
import { SortHeader } from '../../../directives/shared/sort-header';
import { createTableState } from '../../../utils/shared/table-state';
import { TablePager } from '../../shared/table-pager';
import { Doctor } from '../../../models/doctor/doctor.model';
import { PersonSummary } from '../../../models/person/person.model';
import { DoctorService } from '../../../services/doctor/doctor.service';
import { HeadquarterService } from '../../../services/headquarter/headquarter.service';
import { acrossHeadquarters } from '../../../utils/shared/across-headquarters';
import { HeadquarterSummary } from '../../shared/headquarter-summary';
import { DoctorDialogs } from '../../../services/doctor/doctor-dialogs.service';
import { PersonLookupService } from '../../../services/person/person-lookup.service';
import { injectConfirm } from '../../../services/shared/confirm';
import { ToastService } from '../../../services/shared/toast.service';
import { apiErrorMessage } from '../../../utils/shared/api-error';
import { personName, shortId } from '../../../utils/doctor/form-rules';
import { PageHeader } from '../../shared/page-header';

// El procesador aplica los cambios de forma asíncrona (RabbitMQ): tras guardar, la lista
// se vuelve a pedir enseguida y una segunda vez un momento después.
const PROCESSOR_DELAY_MS = 1500;

@Component({
  selector: 'app-doctor-list',
  imports: [PageHeader, RouterLink, SortHeader, TablePager, HeadquarterSummary],
  templateUrl: './doctor-list.html',
})
export class DoctorList {
  private readonly doctorService = inject(DoctorService);
  private readonly headquarterService = inject(HeadquarterService);
  protected readonly headquarterNames = toSignal(
    this.headquarterService.list().pipe(map((list) => new Map(list.map((headquarter) => [headquarter.id, headquarter.name])))),
    { initialValue: new Map<string, string>() },
  );
  private readonly personLookup = inject(PersonLookupService);
  private readonly dialogs = inject(DoctorDialogs);
  private readonly toast = inject(ToastService);
  private readonly confirm = injectConfirm();
  protected readonly session = inject(SessionService);

  protected readonly search = signal('');
  private readonly refresh = signal(0);

  protected readonly doctors = signal<Doctor[]>([]);
  private readonly persons = signal<Map<string, PersonSummary>>(new Map());
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    return term === ''
      ? this.doctors()
      : this.doctors().filter(
          (doctor) =>
            doctor.licenseNumber.toLowerCase().includes(term) ||
            (this.nameOf(doctor) ?? '').toLowerCase().includes(term),
        );
  });

  protected readonly table = createTableState(this.visible, {
    sortKey: 'person',
    accessors: {
      person: (doctor) => this.nameOf(doctor) ?? doctor.idPerson,
      license: (doctor) => doctor.licenseNumber,
      status: (doctor) => this.isActive(doctor),
    },
  });

  constructor() {
    effect((onCleanup) => {
      this.refresh();
      const headquarterId = this.session.headquarterId();
      // El backend exige la sede: sin sede elegida no hay nada que consultar.
      this.loading.set(untracked(() => this.doctors().length === 0));
      this.error.set(null);
      const subscription = forkJoin({
        doctors:
          headquarterId === null
            ? acrossHeadquarters(this.headquarterService.list(), (id) => this.doctorService.list(id))
            : this.doctorService.list(headquarterId),
        persons: this.personLookup.byId(),
      }).subscribe({
        next: ({ doctors, persons }) => {
          this.doctors.set(doctors);
          this.persons.set(persons);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.doctors.set([]);
          this.loading.set(false);
          this.error.set(apiErrorMessage(error, 'No se pudieron cargar los médicos'));
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected nameOf(doctor: Doctor): string | null {
    return personName(this.persons().get(doctor.idPerson));
  }

  protected shortId = shortId;

  // Doctor no tiene `active`: el estado es el de su Person. Si no se pudo leer, es `null`.
  protected isActive(doctor: Doctor): boolean | null {
    return this.persons().get(doctor.idPerson)?.active ?? null;
  }

  protected create(): void {
    this.dialogs.doctor().subscribe(() => this.afterSave('El médico se envió a guardar'));
  }

  protected edit(doctor: Doctor): void {
    this.dialogs.doctor(doctor).subscribe(() => this.afterSave('Los cambios se enviaron a guardar'));
  }

  protected deactivate(doctor: Doctor): void {
    const name = this.nameOf(doctor) ?? doctor.licenseNumber;
    this.confirm(
      'Desactivar al médico',
      `${name} dejará de estar activo: se desactiva su persona.`,
      'Desactivar',
    ).subscribe((confirmed) => {
      if (confirmed && doctor.id) {
        this.changeState(doctor.id, false);
      }
    });
  }

  protected activate(doctor: Doctor): void {
    if (doctor.id) {
      this.changeState(doctor.id, true);
    }
  }

  private changeState(id: string, activate: boolean): void {
    const request = activate ? this.doctorService.activate(id) : this.doctorService.deactivate(id);
    request.subscribe({
      next: () => {
        this.personLookup.refresh();
        this.toast.success(activate ? 'Médico activado' : 'Médico desactivado');
        this.refreshSoon();
      },
      error: (error: HttpErrorResponse) =>
        this.toast.error(apiErrorMessage(error, 'No se pudo cambiar el estado')),
    });
  }

  private afterSave(message: string): void {
    this.toast.success(`${message}; el procesador lo aplica en un momento`);
    this.refreshSoon();
  }

  private refreshSoon(): void {
    this.refresh.update((value) => value + 1);
    setTimeout(() => this.refresh.update((value) => value + 1), PROCESSOR_DELAY_MS);
  }
}