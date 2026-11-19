import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, of } from 'rxjs';

import { SortHeader } from '../../../directives/shared/sort-header';
import { TablePager } from '../../shared/table-pager';
import { Headquarter } from '../../../models/headquarter/headquarter.model';
import { CatalogItem } from '../../../models/product/catalog-item.model';
import { Transfer, TransferStatus } from '../../../models/transfer/transfer.model';
import { HeadquarterService } from '../../../services/headquarter/headquarter.service';
import { CatalogService } from '../../../services/product/catalog.service';
import { injectConfirm } from '../../../services/shared/confirm';
import { ToastService } from '../../../services/shared/toast.service';
import { TransferDialogs } from '../../../services/transfer/transfer-dialogs.service';
import { TransferService } from '../../../services/transfer/transfer.service';
import { apiErrorMessage } from '../../../utils/shared/api-error';
import { createTableState } from '../../../utils/shared/table-state';
import { shortId } from '../../../utils/doctor/form-rules';
import {
  TRANSFER_STATUSES,
  statusLabel,
  statusTag,
} from '../../../utils/transfer/transfer-labels';

@Component({
  selector: 'app-transfer-list',
  imports: [SortHeader, TablePager, DatePipe],
  templateUrl: './transfer-list.html',
})
export class TransferList {
  private readonly transferService = inject(TransferService);
  private readonly headquarterService = inject(HeadquarterService);
  private readonly catalogService = inject(CatalogService);
  private readonly dialogs = inject(TransferDialogs);
  private readonly toast = inject(ToastService);
  private readonly confirm = injectConfirm();

  protected readonly statuses = TRANSFER_STATUSES;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTag = statusTag;

  // Filtros
  protected readonly status = signal<TransferStatus | null>(null);
  protected readonly origin = signal<string | null>(null);
  protected readonly destination = signal<string | null>(null);

  protected readonly transfers = signal<Transfer[]>([]);
  protected readonly headquarters = signal<Headquarter[]>([]);
  private readonly products = signal<CatalogItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly refresh = signal(0);

  // La API devuelve el producto sin nombre: se resuelve contra el catálogo.
  private readonly productNames = computed(
    () => new Map(this.products().map((item) => [item.id, item.name])),
  );

  protected readonly table = createTableState(this.transfers, {
    sortKey: 'createdAt',
    direction: 'desc',
    accessors: {
      product: (transfer) => this.productName(transfer),
      quantity: (transfer) => transfer.quantity,
      origin: (transfer) => transfer.originHeadquarter.name,
      destination: (transfer) => transfer.destinationHeadquarter.name,
      status: (transfer) => statusLabel(transfer.status),
      createdAt: (transfer) => transfer.createdAt,
    },
  });

  constructor() {
    this.headquarterService
      .list()
      .pipe(catchError(() => of([] as Headquarter[])))
      .subscribe((list) => this.headquarters.set(list));
    this.catalogService
      .list({ type: 'PRODUCT' })
      .pipe(catchError(() => of([] as CatalogItem[])))
      .subscribe((list) => this.products.set(list));

    effect((onCleanup) => {
      this.refresh();
      const filters = {
        status: this.status(),
        originHeadquarterId: this.origin(),
        destinationHeadquarterId: this.destination(),
      };
      this.loading.set(true);
      this.error.set(null);
      const subscription = this.transferService.list(filters).subscribe({
        next: (transfers) => {
          this.transfers.set(transfers);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.transfers.set([]);
          this.loading.set(false);
          this.error.set(apiErrorMessage(error, 'No se pudieron cargar los traslados'));
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected productName(transfer: Transfer): string {
    return (
      transfer.product.name ??
      this.productNames().get(transfer.product.id) ??
      `Producto ${shortId(transfer.product.id)}…`
    );
  }

  protected setStatus(value: string): void {
    this.status.set(value === '' ? null : (value as TransferStatus));
  }

  protected setOrigin(value: string): void {
    this.origin.set(value === '' ? null : value);
  }

  protected setDestination(value: string): void {
    this.destination.set(value === '' ? null : value);
  }

  protected create(): void {
    this.dialogs.transfer().subscribe(() => this.afterSave('El traslado quedó registrado'));
  }

  protected edit(transfer: Transfer): void {
    this.dialogs.transfer(transfer).subscribe(() => this.afterSave('El traslado quedó actualizado'));
  }

  protected start(transfer: Transfer): void {
    this.confirm(
      'Iniciar traslado',
      `El traslado de ${transfer.quantity} × "${this.productName(transfer)}" pasará a "En proceso" y ya no se podrá editar.`,
      'Iniciar',
    ).subscribe((confirmed) => {
      if (confirmed) {
        this.changeStatus(transfer, 'IN_PROGRESS', 'El traslado está en proceso');
      }
    });
  }

  protected complete(transfer: Transfer): void {
    this.confirm(
      'Completar traslado',
      `Se marcará como completado el traslado de ${transfer.quantity} × "${this.productName(transfer)}".`,
      'Completar',
    ).subscribe((confirmed) => {
      if (confirmed) {
        this.changeStatus(transfer, 'COMPLETED', 'El traslado quedó completado');
      }
    });
  }

  protected cancel(transfer: Transfer): void {
    this.confirm(
      'Cancelar traslado',
      `¿Seguro que quieres cancelar el traslado de ${transfer.quantity} × "${this.productName(transfer)}"? No se puede deshacer.`,
      'Cancelar traslado',
    ).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.transferService.cancel(transfer.id).subscribe({
        next: () => this.afterSave('El traslado fue cancelado'),
        error: (error: HttpErrorResponse) =>
          this.toast.error(apiErrorMessage(error, 'No se pudo cancelar el traslado')),
      });
    });
  }

  private changeStatus(transfer: Transfer, status: TransferStatus, success: string): void {
    this.transferService.updateStatus(transfer.id, status).subscribe({
      next: () => this.afterSave(success),
      error: (error: HttpErrorResponse) =>
        this.toast.error(apiErrorMessage(error, 'No se pudo cambiar el estado del traslado')),
    });
  }

  private afterSave(message: string): void {
    this.toast.success(message);
    this.refresh.update((value) => value + 1);
  }
}
