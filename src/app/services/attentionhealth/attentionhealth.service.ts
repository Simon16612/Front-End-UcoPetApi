import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AttentionAppointment,
  AttentionHealth,
  AttentionTypeOption,
  CreateAttentionHealthRequest,
} from '../../models/attentionhealth/attentionhealth.model';

@Injectable({ providedIn: 'root' })
export class AttentionHealthService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/attentionhealth`;
  getById(id: number): Observable<AttentionHealth> {
    return this.http.get<AttentionHealth>(`${this.url}/${id}`);
  }
  getByPet(petId: string): Observable<AttentionHealth[]> {
    return this.http.get<AttentionHealth[]>(`${this.url}/pet/${petId}`);
  }
  create(request: CreateAttentionHealthRequest): Observable<AttentionHealth> {
    return this.http.post<AttentionHealth>(this.url, request);
  }
  update(id: number, request: CreateAttentionHealthRequest): Observable<AttentionHealth> {
    return this.http.put<AttentionHealth>(`${this.url}/${id}`, request);
  }
  start(id: number): Observable<AttentionHealth> {
    return this.http.patch<AttentionHealth>(`${this.url}/${id}/start`, null);
  }
  cancel(id: number): Observable<AttentionHealth> {
    return this.http.patch<AttentionHealth>(`${this.url}/${id}/cancel`, null);
  }
  finish(id: number): Observable<AttentionHealth> {
    return this.http.patch<AttentionHealth>(`${this.url}/${id}/finish`, null);
  }
  getAppointment(id: string): Observable<AttentionAppointment> {
    return this.http.get<AttentionAppointment>(`${environment.apiUrl}/appointments/appointment`, {
      params: { id },
    });
  }
  getPendingAppointments(tutorId: string): Observable<AttentionAppointment[]> {
    return this.http.get<AttentionAppointment[]>(`${environment.apiUrl}/appointments/pending`, {
      params: { tutorId },
    });
  }
  getAppointments(tutorId: string, doctorId: string): Observable<AttentionAppointment[]> {
    return this.http.get<AttentionAppointment[]>(`${environment.apiUrl}/appointments`, {
      params: { tutorId, doctorId },
    });
  }
  getActiveAttentionTypes(): Observable<AttentionTypeOption[]> {
    return this.http.get<AttentionTypeOption[]>(
      `${environment.apiUrl}/appointments/appointment-type/active`,
    );
  }
  hasAttentionForAppointment(appointmentId: string): Observable<boolean> {
    return this.getAppointment(appointmentId).pipe(
      switchMap((appointment) =>
        this.getByPet(appointment.petId).pipe(
          map((attentions) =>
            attentions.some((attention) => attention.appointmentId === appointmentId),
          ),
        ),
      ),
    );
  }
}
