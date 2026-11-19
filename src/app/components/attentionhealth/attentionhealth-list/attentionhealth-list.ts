import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AttentionHealth,
  AttentionStatus,
} from '../../../models/attentionhealth/attentionhealth.model';
import { PersonSummary } from '../../../models/person/person.model';
import { Pet } from '../../../models/pet/pet.model';
import { TutorPet } from '../../../models/tutor-pet/tutor-pet.model';
import { AttentionHealthService } from '../../../services/attentionhealth/attentionhealth.service';
import { HeadquarterService } from '../../../services/headquarter/headquarter.service';
import { PersonLookupService } from '../../../services/person/person-lookup.service';
import { PetService } from '../../../services/pet/pet.service';
import { DoctorService } from '../../../services/doctor/doctor.service';
import { SessionService } from '../../../services/session/session.service';
import { TutorPetService } from '../../../services/tutor-pet/tutor-pet.service';
import { PageHeader } from '../../shared/page-header';
import { injectConfirm } from '../../../services/shared/confirm';

type AttentionSortKey = 'attentionId' | 'pet' | 'type' | 'status' | 'date';

@Component({
  selector: 'app-attentionhealth-list',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './attentionhealth-list.html',
})
export class AttentionHealthList implements OnInit {
  private readonly service = inject(AttentionHealthService);
  private readonly confirm = injectConfirm();
  private readonly petService = inject(PetService);
  private readonly doctorService = inject(DoctorService);
  private readonly headquarterService = inject(HeadquarterService);
  private readonly tutorService = inject(TutorPetService);
  private readonly personLookup = inject(PersonLookupService);
  private readonly session = inject(SessionService);
  readonly search = new FormControl('', { nonNullable: true });
  readonly tutorDocument = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<'ALL' | AttentionStatus>('ALL', { nonNullable: true });
  readonly tutorId = new FormControl('', { nonNullable: true });
  readonly petId = new FormControl('', { nonNullable: true });
  readonly tutors = signal<TutorPet[]>([]);
  readonly people = signal(new Map<string, PersonSummary>());
  readonly pets = signal<Pet[]>([]);
  readonly rows = signal<AttentionHealth[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionLoading = signal<number | null>(null);
  readonly pageSize = new FormControl(10, { nonNullable: true });
  readonly pageSizeValue = signal(10);
  readonly currentPage = signal(1);
  readonly defaultScope = signal(false);
  readonly sortKey = signal<AttentionSortKey>('attentionId');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  private allPets: Pet[] = [];
  private currentDoctorId: string | null = null;
  readonly selectedPageSize = this.pageSizeValue.asReadonly();
  readonly totalRows = computed(() => this.rows().length);
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRows() / this.selectedPageSize())),
  );
  readonly sortedRows = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.rows()].sort((left, right) => {
      const leftValue = this.sortValue(left, key);
      const rightValue = this.sortValue(right, key);
      return leftValue.localeCompare(rightValue, 'es', { numeric: true }) * direction;
    });
  });
  readonly pagedRows = computed(() => {
    const pageSize = this.selectedPageSize();
    const start = (this.currentPage() - 1) * pageSize;
    return this.sortedRows().slice(start, start + pageSize);
  });
  readonly firstVisibleRow = computed(() =>
    this.totalRows() ? (this.currentPage() - 1) * this.selectedPageSize() + 1 : 0,
  );
  readonly lastVisibleRow = computed(() =>
    Math.min(this.currentPage() * this.selectedPageSize(), this.totalRows()),
  );
  private all: AttentionHealth[] = [];

  constructor() {
    effect(() => this.loadForHeadquarter(this.session.headquarterId()));
  }
  ngOnInit(): void {
    this.tutorDocument.valueChanges.subscribe((document) => this.loadForDocument(document));
    this.search.valueChanges.subscribe(() => this.filter());
    this.status.valueChanges.subscribe(() => this.filter());
    this.pageSize.valueChanges.subscribe((value) => {
      const normalized = Number(value) || 10;
      this.pageSizeValue.set(normalized);
      if (value !== normalized) {
        this.pageSize.setValue(normalized, { emitEvent: false });
      }
      this.goToFirstPage();
    });
  }

  private loadForHeadquarter(headquarterId: string | null): void {
    this.tutorId.setValue('', { emitEvent: false });
    this.petId.setValue('', { emitEvent: false });
    this.tutorDocument.setValue('', { emitEvent: false });
    this.tutors.set([]);
    this.pets.set([]);
    this.all = [];
    this.rows.set([]);
    this.defaultScope.set(false);
    this.error.set('');
    if (!headquarterId) {
      this.loading.set(false);
      this.error.set('Selecciona una sede para consultar las atenciones.');
      return;
    }
    this.loading.set(true);
    forkJoin({
      pets: this.petService
        .getByHeadquarter({ headquarterId, isActive: true })
        .pipe(catchError(() => of([] as Pet[]))),
      tutors: this.tutorService.list().pipe(catchError(() => of([] as TutorPet[]))),
      people: this.personLookup.byId(),
      doctors: this.doctorService.list(headquarterId).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ pets, tutors, people, doctors }) => {
        this.allPets = pets;
        this.pets.set([]);
        this.tutors.set(tutors);
        this.people.set(people);
        this.currentDoctorId =
          doctors.find((doctor) => doctor.idPerson === this.session.profile()?.personId)?.id ??
          null;
        this.loadAllAttentions();
      },
      error: () => this.error.set('No fue posible cargar los filtros.'),
    });
  }

  loadForTutor(tutorId: string): void {
    this.tutorId.setValue(tutorId, { emitEvent: false });
    const tutor = this.tutors().find((item) => item.id === tutorId);
    const document = tutor ? (this.people().get(tutor.person)?.documentNumber ?? '') : '';
    this.tutorDocument.setValue(document, { emitEvent: false });
    this.petId.setValue('', { emitEvent: false });
    this.pets.set(this.allPets.filter((pet) => pet.tutorId === tutorId));
    this.defaultScope.set(false);
    this.error.set('');
    this.all = [];
    this.rows.set([]);
    if (!tutorId) return;
    const tutorPets = this.pets().filter((pet) => pet.tutorId === tutorId);
    this.loading.set(true);
    if (!tutorPets.length) {
      this.loading.set(false);
      return;
    }
    forkJoin(tutorPets.map((pet) => this.service.getByPet(pet.id))).subscribe({
      next: (histories) => {
        this.all = histories.flat();
        this.filter();
      },
      error: () => this.error.set('No fue posible consultar el historial del tutor.'),
      complete: () => this.loading.set(false),
    });
  }

  loadForDocument(document: string): void {
    const normalized = document.trim().toLowerCase();
    if (!normalized) {
      this.clearTutorSelection();
      return;
    }
    const tutor = this.tutors().find((item) => {
      const person = this.people().get(item.person);
      return person?.documentNumber?.toLowerCase() === normalized;
    });
    if (tutor) {
      this.loadForTutor(tutor.id);
    } else {
      // Keep the typed document while waiting for the complete unique number.
      this.clearTutorSelection();
    }
  }

  private clearTutorSelection(): void {
    this.tutorId.setValue('', { emitEvent: false });
    this.petId.setValue('', { emitEvent: false });
    this.pets.set([]);
    this.all = [];
    this.rows.set([]);
    this.loadAllAttentions();
  }

  private loadAllAttentions(): void {
    this.defaultScope.set(true);
    this.pets.set(this.allPets);
    if (!this.allPets.length || !this.currentDoctorId) {
      this.all = [];
      this.filter();
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    forkJoin(this.allPets.map((pet) => this.service.getByPet(pet.id))).subscribe({
      next: (histories) => {
        this.all = histories
          .flat()
          .filter((attention) => attention.doctorId === this.currentDoctorId);
        this.filter();
      },
      error: () => this.error.set('No fue posible consultar las atenciones.'),
      complete: () => this.loading.set(false),
    });
  }

  loadForPet(petId: string): void {
    this.petId.setValue(petId, { emitEvent: false });
    this.error.set('');
    if (!petId) {
      if (this.tutorId.value) {
        this.loadForTutor(this.tutorId.value);
      } else {
        this.loadAllAttentions();
      }
      return;
    }
    this.loading.set(true);
    this.service.getByPet(petId).subscribe({
      next: (rows) => {
        this.all = rows;
        this.filter();
      },
      error: () => this.error.set('No fue posible consultar las atenciones.'),
      complete: () => this.loading.set(false),
    });
  }
  filter(): void {
    const query = this.search.value.trim().toLowerCase();
    const selectedStatus = this.status.value;
    this.rows.set(
      this.all.filter(
        (row) =>
          (!query ||
            `${this.petName(row.petId)} ${row.attentionType} ${row.attentionId}`
              .toLowerCase()
              .includes(query)) &&
          (selectedStatus === 'ALL' || row.status === selectedStatus),
      ),
    );
    this.keepPageInRange();
  }
  sortBy(key: AttentionSortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDirection.set('asc');
    }
    this.goToFirstPage();
  }
  sortValue(row: AttentionHealth, key: AttentionSortKey): string {
    switch (key) {
      case 'pet':
        return this.petName(row.petId);
      case 'type':
        return row.attentionType;
      case 'status':
        return this.label(row.status);
      case 'date':
        return row.attentionDate;
      default:
        return String(row.attentionId);
    }
  }
  goToFirstPage(): void {
    this.currentPage.set(1);
  }
  goToPreviousPage(): void {
    this.currentPage.update((page) => Math.max(1, page - 1));
  }
  goToNextPage(): void {
    this.currentPage.update((page) => Math.min(this.totalPages(), page + 1));
  }
  private keepPageInRange(): void {
    this.currentPage.update((page) => Math.min(Math.max(1, page), this.totalPages()));
  }
  petName(petId: string): string {
    return this.pets().find((pet) => pet.id === petId)?.name ?? petId;
  }
  personName(tutor: TutorPet): string {
    const person = this.people().get(tutor.person);
    return person ? `${person.firstName} ${person.lastName}` : tutor.person;
  }
  executeAction(row: AttentionHealth, action: 'start' | 'cancel' | 'finish'): void {
    if (action === 'start') {
      this.runAction(row, action);
      return;
    }
    const finishing = action === 'finish';
    this.confirm(
      finishing ? 'Finalizar atención' : 'Cancelar atención',
      finishing
        ? `La atención #${row.attentionId} se cerrará: se crean las órdenes de sus procedimientos, la venta y la factura de los productos, se descuenta el stock usado y la cita queda completada. No se puede deshacer.`
        : `¿Seguro que quieres cancelar la atención #${row.attentionId}? No se puede deshacer.`,
      finishing ? 'Finalizar' : 'Cancelar atención',
      finishing ? 'primary' : 'danger',
    ).subscribe((confirmed) => {
      if (confirmed) {
        this.runAction(row, action);
      }
    });
  }

  private runAction(row: AttentionHealth, action: 'start' | 'cancel' | 'finish'): void {
    this.actionLoading.set(row.attentionId);
    const request =
      action === 'start'
        ? this.service.start(row.attentionId)
        : action === 'cancel'
          ? this.service.cancel(row.attentionId)
          : this.service.finish(row.attentionId);
    request.subscribe({
      next: () =>
        this.tutorId.value
          ? this.loadForTutor(this.tutorId.value)
          : this.loadForPet(this.petId.value),
      error: (error) =>
        this.error.set(error?.error?.message ?? 'No fue posible actualizar el estado.'),
      complete: () => this.actionLoading.set(null),
    });
  }
  label(status: AttentionStatus): string {
    return {
      REGISTERED: 'Registrada',
      IN_PROGRESS: 'En progreso',
      CANCELLED: 'Cancelada',
      COMPLETED: 'Completada',
    }[status];
  }
  statusBadgeClass(status: AttentionStatus): string {
    return {
      REGISTERED: 'bg-secondary-subtle text-secondary-emphasis',
      IN_PROGRESS: 'bg-primary-subtle text-primary-emphasis',
      CANCELLED: 'bg-danger-subtle text-danger-emphasis',
      COMPLETED: 'bg-success-subtle text-success-emphasis',
    }[status];
  }
}
