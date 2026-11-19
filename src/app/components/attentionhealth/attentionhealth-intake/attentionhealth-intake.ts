import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { TutorPetService } from '../../../services/tutor-pet/tutor-pet.service';
import { PersonLookupService } from '../../../services/person/person-lookup.service';
import { PetService } from '../../../services/pet/pet.service';
import { SessionService } from '../../../services/session/session.service';
import { TutorPet } from '../../../models/tutor-pet/tutor-pet.model';
import { PersonSummary } from '../../../models/person/person.model';
import { Pet } from '../../../models/pet/pet.model';

@Component({
  selector: 'app-attentionhealth-intake',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './attentionhealth-intake.html',
})
export class AttentionHealthIntake implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly tutorService = inject(TutorPetService);
  private readonly personLookup = inject(PersonLookupService);
  private readonly petService = inject(PetService);
  private readonly session = inject(SessionService);
  readonly tutors = signal<TutorPet[]>([]);
  readonly people = signal(new Map<string, PersonSummary>());
  readonly pets = signal<Pet[]>([]);
  readonly loading = signal(true);
  readonly searching = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    documentNumber: ['', [Validators.required, Validators.minLength(3)]],
    tutorId: ['', Validators.required],
    petId: ['', Validators.required],
  });

  ngOnInit(): void {
    this.tutorService
      .list()
      .pipe(catchError(() => of([] as TutorPet[])))
      .subscribe({
        next: (tutors) => this.tutors.set(tutors),
        error: () => this.error.set('No fue posible cargar los tutores.'),
        complete: () => this.loading.set(false),
      });
    this.personLookup.byId().subscribe((people) => this.people.set(people));
  }
  findTutor(): void {
    this.error.set('');
    this.pets.set([]);
    this.form.controls.tutorId.reset();
    this.form.controls.petId.reset();
    const documentNumber = this.form.controls.documentNumber.value.trim().toLowerCase();
    if (this.form.controls.documentNumber.invalid) {
      this.form.controls.documentNumber.markAsTouched();
      return;
    }
    const tutor = this.tutors().find(
      (item) => this.people().get(item.person)?.documentNumber?.toLowerCase() === documentNumber,
    );
    if (!tutor) {
      this.error.set('No encontramos un tutor con ese número de documento.');
      return;
    }
    this.form.controls.tutorId.setValue(tutor.id);
    this.searching.set(true);
    const headquarterId = this.session.headquarterId();
    if (!headquarterId) {
      this.error.set('Selecciona una sede antes de buscar las mascotas.');
      this.searching.set(false);
      return;
    }
    this.petService.getByTutor(tutor.id, headquarterId).subscribe({
      next: (pets) => {
        const activePets = pets.filter((pet) => pet.active);
        this.pets.set(activePets);
        if (!activePets.length)
          this.error.set('El tutor no tiene mascotas activas en la sede seleccionada.');
      },
      error: () => this.error.set('No fue posible cargar las mascotas del tutor.'),
      complete: () => this.searching.set(false),
    });
  }
  continueToAttention(): void {
    if (this.form.controls.petId.invalid || this.form.controls.tutorId.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.router.navigate(['atencion'], {
      relativeTo: this.route,
      queryParams: {
        petId: this.form.controls.petId.value,
        tutorId: this.form.controls.tutorId.value,
      },
    });
  }
  personName(tutor: TutorPet): string {
    const person = this.people().get(tutor.person);
    return person ? `${person.firstName} ${person.lastName}` : tutor.person;
  }
  selectedTutorName(): string {
    const tutor = this.tutors().find((item) => item.id === this.form.controls.tutorId.value);
    return tutor ? this.personName(tutor) : '';
  }
}
