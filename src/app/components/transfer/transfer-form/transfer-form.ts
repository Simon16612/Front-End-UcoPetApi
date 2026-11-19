import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Subscription, catchError, forkJoin, map, of } from 'rxjs';

import { ModalFrame } from '../../shared/modal-frame';
import { Headquarter } from '../../../models/headquarter/headquarter.model';
import { CatalogItem } from '../../../models/product/catalog-item.model';
import { Stock } from '../../../models/product/stock.model';
import { Transfer, TransferRequest } from '../../../models/transfer/transfer.model';
import { HeadquarterService } from '../../../services/headquarter/headquarter.service';
import { CatalogService } from '../../../services/product/catalog.service';
import { StockService } from '../../../services/product/stock.service';
import { TransferService } from '../../../services/transfer/transfer.service';
import { apiErrorMessage } from '../../../utils/shared/api-error';
import { shortId } from '../../../utils/doctor/form-rules';
import {
  DIFFERENT_HEADQUARTERS,
  OBSERVATIONS_RULES,
  QUANTITY_RULES,
} from '../../../utils/transfer/form-rules';

interface Option {
  id: string;
  label: string;
}

@Component({
  selector: 'app-transfer-form',
  imports: [ReactiveFormsModule, ModalFrame],
  templateUrl: './transfer-form.html',
})
export class TransferForm implements OnInit {
  private readonly transferService = inject(TransferService);
  private readonly headquarterService = inject(HeadquarterService);
  private readonly catalogService = inject(CatalogService);
  private readonly stockService = inject(StockService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly modal = inject(NgbActiveModal);

  protected readonly form = this.fb.group(
    {
      originHeadquarterId: ['', Validators.required],
      destinationHeadquarterId: ['', Validators.required],
      productId: ['', Validators.required],
      quantity: this.fb.control<number | null>(null, QUANTITY_RULES),
      observations: ['', OBSERVATIONS_RULES],
    },
    { validators: DIFFERENT_HEADQUARTERS },
  );

  protected readonly transferId = signal<string | null>(null);
  private readonly current = signal<Transfer | null>(null);
  private readonly headquarters = signal<Headquarter[]>([]);
  private readonly products = signal<CatalogItem[]>([]);
  // null = todavía no se sabe (cargando o la consulta falló): no se bloquea por stock.
  private readonly stocks = signal<Stock[] | null>(null);
  private stockRequest: Subscription | null = null;

  protected readonly loading = signal(true);
  protected readonly loadingStock = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  // Sedes activas; al editar se conservan las de la propia orden aunque se hayan desactivado.
  protected readonly headquarterOptions = computed<Option[]>(() => {
    const options = this.headquarters()
      .filter((item) => item.isActive)
      .map((item) => ({ id: item.id, label: item.name }));
    const extra = [this.current()?.originHeadquarter, this.current()?.destinationHeadquarter];
    for (const item of extra) {
      if (item && !options.some((option) => option.id === item.id)) {
        options.push({ id: item.id, label: item.name ?? `Sede ${shortId(item.id)}…` });
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly productOptions = computed<Option[]>(() => {
    const options = this.products().map((item) => ({ id: item.id, label: item.name }));
    const product = this.current()?.product;
    if (product && !options.some((option) => option.id === product.id)) {
      options.push({ id: product.id, label: product.name ?? `Producto ${shortId(product.id)}…` });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly sameHeadquarter = computed(() => {
    const { originHeadquarterId, destinationHeadquarterId } = this.value();
    return !!originHeadquarterId && originHeadquarterId === destinationHeadquarterId;
  });

  // Stock del producto elegido en la sede de origen (solo informativo: la API vuelve a validar).
  protected readonly available = computed<number | null>(() => {
    const { originHeadquarterId, productId } = this.value();
    const stocks = this.stocks();
    if (!originHeadquarterId || !productId || stocks === null || this.loadingStock()) {
      return null;
    }
    return stocks.find((stock) => stock.headquarterId === originHeadquarterId)?.quantity ?? 0;
  });

  protected readonly exceedsStock = computed(() => {
    const available = this.available();
    const quantity = this.value().quantity;
    return available !== null && quantity !== null && quantity > available;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stockRequest?.unsubscribe());
  }

  ngOnInit(): void {
    forkJoin({
      headquarters: this.headquarterService.list().pipe(catchError(() => of([] as Headquarter[]))),
      products: this.catalogService
        .list({ type: 'PRODUCT', active: true })
        .pipe(catchError(() => of([] as CatalogItem[]))),
    }).subscribe(({ headquarters, products }) => {
      this.headquarters.set(headquarters);
      this.products.set(products);
      this.loading.set(false);
    });
  }

  // Precarga un traslado para editarlo (la API solo lo permite en estado PENDING).
  edit(transfer: Transfer): void {
    this.transferId.set(transfer.id);
    this.current.set(transfer);
    this.form.patchValue({
      originHeadquarterId: transfer.originHeadquarter.id,
      destinationHeadquarterId: transfer.destinationHeadquarter.id,
      productId: transfer.product.id,
      quantity: transfer.quantity,
      observations: transfer.observations ?? '',
    });
    this.loadStock(transfer.product.id);
  }

  protected onProductChange(): void {
    this.loadStock(this.form.controls.productId.value);
  }

  protected save(): void {
    if (this.form.invalid || this.exceedsStock()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: TransferRequest = {
      originHeadquarterId: value.originHeadquarterId,
      destinationHeadquarterId: value.destinationHeadquarterId,
      productId: value.productId,
      quantity: value.quantity as number,
      observations: value.observations.trim() === '' ? null : value.observations.trim(),
    };
    const id = this.transferId();
    this.saving.set(true);
    this.error.set(null);
    (id === null
      ? this.transferService.create(request)
      : this.transferService.update(id, request)
    ).subscribe({
      next: (saved) => this.modal.close(saved),
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(
          apiErrorMessage(
            error,
            id === null ? 'No se pudo crear el traslado' : 'No se pudo actualizar el traslado',
          ),
        );
      },
    });
  }

  protected invalid(field: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[field];
    return control.touched && control.invalid;
  }

  protected hasError(field: keyof typeof this.form.controls, error: string): boolean {
    const control = this.form.controls[field];
    return control.touched && control.hasError(error);
  }

  private loadStock(productId: string): void {
    this.stockRequest?.unsubscribe();
    this.stocks.set(null);
    if (!productId) {
      this.loadingStock.set(false);
      return;
    }
    this.loadingStock.set(true);
    this.stockRequest = this.stockService.findByProduct(productId).subscribe({
      next: (stocks) => {
        this.stocks.set(stocks);
        this.loadingStock.set(false);
      },
      error: () => this.loadingStock.set(false),
    });
  }
}
