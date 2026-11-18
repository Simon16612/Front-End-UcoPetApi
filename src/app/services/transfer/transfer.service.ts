import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  Transfer,
  TransferFilters,
  TransferRequest,
  TransferStatus,
} from '../../models/transfer/transfer.model';
import { toHttpParams } from '../../utils/shared/http-params';

@Injectable({ providedIn: 'root' })
export class TransferService {
  private readonly http = inject(HttpClient);
  // La API de traslados no lleva /v1 (/api/transfers), por eso no usa apiUrl.
  private readonly url = `${environment.apiBase}/transfers`;

  list(filters: TransferFilters = {}): Observable<Transfer[]> {
    return this.http.get<Transfer[]>(this.url, { params: toHttpParams(filters) });
  }

  getById(id: string): Observable<Transfer> {
    return this.http.get<Transfer>(`${this.url}/${id}`);
  }

  create(request: TransferRequest): Observable<Transfer> {
    return this.http.post<Transfer>(this.url, request);
  }

  update(id: string, request: TransferRequest): Observable<Transfer> {
    return this.http.put<Transfer>(`${this.url}/${id}`, request);
  }

  updateStatus(id: string, status: TransferStatus): Observable<Transfer> {
    return this.http.patch<Transfer>(`${this.url}/${id}/status`, { status });
  }

  cancel(id: string): Observable<void> {
    return this.http.patch<void>(`${this.url}/${id}/cancel`, null);
  }
}
