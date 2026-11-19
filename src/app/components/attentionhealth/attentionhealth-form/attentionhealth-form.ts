import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { AttentionHealthService } from '../../../services/attentionhealth/attentionhealth.service';
import { DoctorService } from '../../../services/doctor/doctor.service';
import { HeadquarterService } from '../../../services/headquarter/headquarter.service';
import { PersonLookupService } from '../../../services/person/person-lookup.service';
import { PetService } from '../../../services/pet/pet.service';
import { SessionService } from '../../../services/session/session.service';
import { TutorPetService } from '../../../services/tutor-pet/tutor-pet.service';
import { ProductService } from '../../../services/product/product.service';
import { ProcedureService } from '../../../services/procedure/procedure.service';
import { AttentionTypeOption } from '../../../models/attentionhealth/attentionhealth.model';
import { Doctor } from '../../../models/doctor/doctor.model';
import { Headquarter } from '../../../models/headquarter/headquarter.model';
import { PersonSummary } from '../../../models/person/person.model';
import { Pet } from '../../../models/pet/pet.model';
import { TutorPet } from '../../../models/tutor-pet/tutor-pet.model';
import { Product } from '../../../models/product/product.model';
import { Procedure } from '../../../models/procedure/procedure.model';
import { AttentionHealthProduct } from '../../../models/attentionhealth/attentionhealth.model';
import {
  attentionDateMustBeToday,
  toLocalDateTimeInput,
} from '../../../utils/attentionhealth/form-rules';
import { StockService } from '../../../services/product/stock.service';

@Component({
  selector: 'app-attentionhealth-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './attentionhealth-form.html',
})
export class AttentionHealthForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AttentionHealthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly petService = inject(PetService);
  private readonly doctorService = inject(DoctorService);
  private readonly tutorService = inject(TutorPetService);
  private readonly personLookup = inject(PersonLookupService);
  private readonly headquarterService = inject(HeadquarterService);
  private readonly productService = inject(ProductService);
  private readonly procedureService = inject(ProcedureService);
  private readonly stockService = inject(StockService);

  readonly pets = signal<Pet[]>([]);
  readonly doctors = signal<Doctor[]>([]);
  readonly tutors = signal<TutorPet[]>([]);
  private readonly allTutors = signal<TutorPet[]>([]);
  readonly appointments = signal<
    import('../../../models/attentionhealth/attentionhealth.model').AttentionAppointment[]
  >([]);
  readonly people = signal(new Map<string, PersonSummary>());
  readonly headquarters = signal<Headquarter[]>([]);
  readonly attentionTypes = signal<AttentionTypeOption[]>([]);
  readonly products = signal<Product[]>([]);
  readonly procedures = signal<Procedure[]>([]);
  readonly selectedProcedureIds = signal<string[]>([]);
  readonly procedureSelection = this.fb.nonNullable.control('', Validators.required);
  readonly selectedProducts = signal<AttentionHealthProduct[]>([]);
  readonly productSelection = this.fb.nonNullable.group({
    productId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
  });
  readonly error = signal('');
  readonly validationMessage = signal('');
  readonly itemError = signal('');
  readonly loading = signal(true);
  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.nonNullable.group({
    petId: ['', Validators.required],
    tutorId: ['', Validators.required],
    doctorId: ['', Validators.required],
    appointmentId: ['', Validators.required],
    headquarterId: ['', Validators.required],
    attentionDate: [toLocalDateTimeInput(), [Validators.required, attentionDateMustBeToday]],
    attentionType: ['', Validators.required],
    reason: ['', Validators.maxLength(500)],
    clinicalAssessment: ['', Validators.maxLength(2000)],
    observations: ['', Validators.maxLength(1000)],
    diagnosis: ['', Validators.maxLength(1000)],
    temperature: [null as number | null, [Validators.required, Validators.min(0)]],
    weight: [null as number | null, [Validators.required, Validators.min(0)]],
    heartRate: [null as number | null, [Validators.required, Validators.min(0)]],
    respiratoryRate: [null as number | null, [Validators.required, Validators.min(0)]],
    bodyConditionScore: [null as number | null, [Validators.min(0), Validators.max(9)]],
  });

  ngOnInit(): void {
    const headquarterId = this.session.headquarterId();
    forkJoin({
      headquarters: this.headquarterService.list().pipe(catchError(() => of([] as Headquarter[]))),
      pets: headquarterId
        ? this.petService
            .getByHeadquarter({ headquarterId, isActive: true })
            .pipe(catchError(() => of([] as Pet[])))
        : of([] as Pet[]),
      doctors: headquarterId
        ? this.doctorService.list(headquarterId).pipe(catchError(() => of([] as Doctor[])))
        : of([] as Doctor[]),
      tutors: this.tutorService.list().pipe(catchError(() => of([] as TutorPet[]))),
      people: this.personLookup.byId(),
      types: this.service
        .getActiveAttentionTypes()
        .pipe(catchError(() => of([] as AttentionTypeOption[]))),
      products: this.loadProductsWithStock(headquarterId),
      procedures: this.procedureService.getActive().pipe(catchError(() => of([] as Procedure[]))),
    }).subscribe({
      next: ({ headquarters, pets, doctors, tutors, people, types, products, procedures }) => {
        this.headquarters.set(
          headquarters.filter(
            (item) => item.isActive && (this.session.isAdmin() || item.id === headquarterId),
          ),
        );
        this.pets.set(pets);
        const currentPersonId = this.session.profile()?.personId;
        const currentDoctor = doctors.find((doctor) => doctor.idPerson === currentPersonId);
        this.doctors.set(currentDoctor ? [currentDoctor] : []);
        this.allTutors.set(tutors);
        this.people.set(people);
        this.attentionTypes.set(types);
        this.products.set(products);
        this.procedures.set(procedures);
        this.form.controls.headquarterId.setValue(headquarterId ?? '');
        if (!this.session.isAdmin()) {
          this.form.controls.headquarterId.disable({ emitEvent: false });
        }
        const appointmentId = this.route.snapshot.paramMap.get('appointmentId');
        const attentionId = this.route.snapshot.paramMap.get('attentionId');
        const selectedPetId = this.route.snapshot.queryParamMap.get('petId');
        const selectedTutorId = this.route.snapshot.queryParamMap.get('tutorId');
        if (!appointmentId && !attentionId) {
          if (currentDoctor?.id) {
            this.form.controls.doctorId.setValue(currentDoctor.id);
          }
        }
        if (selectedPetId) {
          this.pets.set(pets.filter((pet) => pet.id === selectedPetId));
          this.form.patchValue({ petId: selectedPetId, tutorId: selectedTutorId ?? '' });
          this.onPetChange();
        }
        if (appointmentId) this.loadAppointment(appointmentId);
        if (attentionId) this.loadAttention(Number(attentionId));
      },
      error: () => this.error.set('No fue posible cargar las opciones del formulario.'),
      complete: () => this.loading.set(false),
    });
  }

  private loadProductsWithStock(headquarterId: string | null) {
    if (!headquarterId) return of([] as Product[]);
    return this.productService.list({ active: true, sellable: true }).pipe(
      switchMap((products) =>
        products.length === 0
          ? of([] as Product[])
          : forkJoin(
              products.map((product) =>
                this.stockService.findByProduct(product.id!).pipe(catchError(() => of([]))),
              ),
            ).pipe(
              map((stocks) =>
                products.map((product, index) => ({
                  ...product,
                  stockAtLocation:
                    stocks[index].find((stock) => stock.headquarterId === headquarterId)
                      ?.quantity ?? 0,
                })),
              ),
            ),
      ),
      catchError(() => of([] as Product[])),
    );
  }

  loadAttention(id: number): void {
    this.service.getById(id).subscribe({
      next: (attention) => {
        this.editingId.set(id);
        this.form.patchValue({
          petId: attention.petId,
          tutorId: attention.tutorId,
          doctorId: attention.doctorId,
          appointmentId: attention.appointmentId ?? '',
          headquarterId: attention.headquarterId,
          attentionDate: attention.attentionDate.slice(0, 19),
          attentionType: attention.attentionType,
          reason: attention.reason ?? '',
          clinicalAssessment: attention.clinicalAssessment ?? '',
          observations: attention.observations ?? '',
          diagnosis: attention.diagnosis ?? '',
          temperature: attention.vitalSigns?.temperature ?? null,
          weight: attention.vitalSigns?.weight ?? null,
          heartRate: attention.vitalSigns?.heartRate ?? null,
          respiratoryRate: attention.vitalSigns?.respiratoryRate ?? null,
          bodyConditionScore: attention.vitalSigns?.bodyConditionScore ?? null,
        });
        this.selectedProducts.set(attention.products ?? []);
        this.selectedProcedureIds.set(attention.procedureIds ?? []);
        if (!attention.appointmentId) {
          this.form.controls.appointmentId.clearValidators();
          this.form.controls.appointmentId.updateValueAndValidity({ emitEvent: false });
        }
        const pet = this.pets().find((item) => item.id === attention.petId);
        this.tutors.set(
          pet
            ? this.allTutors().filter((tutor) => tutor.id === pet.tutorId)
            : this.allTutors().filter((tutor) => tutor.id === attention.tutorId),
        );
        if (attention.appointmentId) {
          this.service.getAppointment(attention.appointmentId).subscribe({
            next: (appointment) => this.appointments.set([appointment]),
            error: () => this.error.set('No fue posible cargar la cita asociada.'),
          });
        }
        this.lockReferenceFields();
      },
      error: () => this.error.set('No fue posible cargar la atención.'),
    });
  }

  private lockReferenceFields(): void {
    this.form.controls.petId.disable({ emitEvent: false });
    this.form.controls.tutorId.disable({ emitEvent: false });
    this.form.controls.doctorId.disable({ emitEvent: false });
    this.form.controls.headquarterId.disable({ emitEvent: false });
    this.form.controls.appointmentId.disable({ emitEvent: false });
  }

  loadAppointment(id: string): void {
    this.service.getAppointment(id).subscribe({
      next: (appointment) => {
        this.pets.set(this.pets().filter((pet) => pet.id === appointment.petId));
        this.form.patchValue({
          appointmentId: appointment.id,
          petId: appointment.petId,
          tutorId: appointment.tutorId,
          doctorId: appointment.doctorId,
        });
        this.onPetChange();
        this.form.controls.appointmentId.setValue(appointment.id);
        this.service.hasAttentionForAppointment(id).subscribe({
          next: (used) => {
            if (used) this.error.set('Esta cita ya tiene una atención asignada.');
          },
        });
      },
      error: () => this.error.set('No fue posible consultar la cita.'),
    });
  }

  personName(id: string): string {
    const person = this.people().get(id);
    return person ? `${person.firstName} ${person.lastName}` : id;
  }

  onPetChange(): void {
    const pet = this.pets().find((item) => item.id === this.form.controls.petId.value);
    if (!pet) {
      this.tutors.set([]);
      this.appointments.set([]);
      this.form.controls.tutorId.setValue('');
      this.form.controls.appointmentId.setValue('');
      return;
    }
    this.tutors.set(this.allTutors().filter((tutor) => tutor.id === pet.tutorId));
    this.form.controls.tutorId.setValue(pet.tutorId);
    this.loadAvailableAppointments(pet.id, pet.tutorId, this.form.controls.doctorId.value);
  }

  onDoctorChange(): void {
    const pet = this.pets().find((item) => item.id === this.form.controls.petId.value);
    if (pet) this.loadAvailableAppointments(pet.id, pet.tutorId, this.form.controls.doctorId.value);
  }

  addProduct(): void {
    this.itemError.set('');
    if (this.productSelection.invalid) {
      this.productSelection.markAllAsTouched();
      return;
    }
    const { productId, quantity } = this.productSelection.getRawValue();
    const product = this.products().find((item) => item.id === productId);
    const available = product?.stockAtLocation ?? 0;
    const currentQuantity =
      this.selectedProducts().find((item) => item.productId === productId)?.quantity ?? 0;
    if (available <= 0) {
      this.itemError.set('Este producto no tiene inventario disponible en la sede seleccionada.');
      return;
    }
    if (currentQuantity + quantity > available) {
      this.itemError.set(`La cantidad solicitada supera el inventario disponible (${available}).`);
      return;
    }
    const current = this.selectedProducts();
    const existing = current.find((item) => item.productId === productId);
    this.selectedProducts.set(
      existing
        ? current.map((item) =>
            item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item,
          )
        : [...current, { productId, quantity }],
    );
    this.productSelection.reset({ productId: '', quantity: 1 });
  }

  removeProduct(productId: string): void {
    this.selectedProducts.set(
      this.selectedProducts().filter((item) => item.productId !== productId),
    );
  }

  productName(productId: string): string {
    return this.products().find((product) => product.id === productId)?.name ?? productId;
  }

  addProcedure(): void {
    const procedureId = this.procedureSelection.value;
    this.itemError.set('');
    if (!procedureId) {
      this.itemError.set('Selecciona un procedimiento antes de agregarlo.');
      return;
    }
    if (this.selectedProcedureIds().includes(procedureId)) {
      this.itemError.set('Este procedimiento ya fue agregado a la atención.');
      return;
    }
    this.selectedProcedureIds.set([...this.selectedProcedureIds(), procedureId]);
    this.procedureSelection.reset();
  }

  removeProcedure(procedureId: string): void {
    this.selectedProcedureIds.set(this.selectedProcedureIds().filter((id) => id !== procedureId));
  }

  procedureName(procedureId: string): string {
    const procedure = this.procedures().find((item) => item.id === procedureId);
    return procedure ? `${procedure.code} · ${procedure.type}` : procedureId;
  }

  loadAvailableAppointments(petId: string, tutorId: string, doctorId: string): void {
    this.appointments.set([]);
    this.form.controls.appointmentId.setValue('');
    if (!doctorId) return;
    this.service.getAppointments(tutorId, doctorId).subscribe({
      next: (appointments) => {
        this.service.getByPet(petId).subscribe({
          next: (attentions) => {
            const consumed = new Set(
              attentions.map((attention) => attention.appointmentId).filter(Boolean),
            );
            this.appointments.set(
              appointments.filter(
                (appointment) =>
                  appointment.status === 'CONFIRMED' &&
                  appointment.petId === petId &&
                  appointment.doctorId === doctorId &&
                  !consumed.has(appointment.id),
              ),
            );
          },
          error: () => this.error.set('No fue posible validar las citas consumidas.'),
        });
      },
      error: () => this.error.set('No fue posible consultar las citas de la mascota.'),
    });
  }

  submit(): void {
    this.validationMessage.set('');
    if (this.form.invalid || this.error()) {
      this.form.markAllAsTouched();
      if (this.form.invalid) {
        this.validationMessage.set(
          'Completa los campos obligatorios y corrige las validaciones antes de registrar la atención.',
        );
      }
      return;
    }
    const value = this.form.getRawValue();
    const request = {
      ...value,
      status: 'IN_PROGRESS' as const,
      vitalSigns: {
        temperature: value.temperature,
        weight: value.weight,
        heartRate: value.heartRate,
        respiratoryRate: value.respiratoryRate,
        bodyConditionScore: value.bodyConditionScore,
        measurementDate: null,
      },
      products: this.selectedProducts(),
      procedureIds: this.selectedProcedureIds(),
    };
    const operation =
      this.editingId() === null
        ? this.service.create(request)
        : this.service.update(this.editingId()!, request);
    operation.subscribe({
      next: () => this.router.navigate(['/atenciones']),
      error: (err) => {
        const message =
          typeof err?.error === 'string'
            ? err.error
            : (err?.error?.message ?? err?.error?.detail ?? err?.message);
        this.error.set(message || 'No fue posible guardar la atención.');
      },
    });
  }
}
