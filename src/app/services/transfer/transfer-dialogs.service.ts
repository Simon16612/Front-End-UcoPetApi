import { Injectable, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { EMPTY, Observable, catchError, from } from 'rxjs';

import { Transfer } from '../../models/transfer/transfer.model';
import { TransferForm } from '../../components/transfer/transfer-form/transfer-form';

@Injectable({ providedIn: 'root' })
export class TransferDialogs {
  private readonly modalService = inject(NgbModal);

  transfer(transfer: Transfer | null = null): Observable<Transfer> {
    const ref = this.modalService.open(TransferForm, {
      size: 'lg',
      backdrop: 'static',
      scrollable: true,
    });
    if (transfer !== null) {
      ref.componentInstance.edit(transfer);
    }
    return from(ref.result as Promise<Transfer>).pipe(catchError(() => EMPTY));
  }
}
