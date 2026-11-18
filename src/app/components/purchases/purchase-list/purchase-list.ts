import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { PageHeader } from '../../shared/page-header';
import { KpiCard } from '../../shared/kpi-card';
import { TablePager } from '../../shared/table-pager';
import { SortHeader } from '../../../directives/shared/sort-header';
import { createTableState } from '../../../utils/shared/table-state';
import { labelOf } from '../../../models/product/catalog-enums';
import { Purchase, PurchaseSupplierOption } from '../../../models/purchases/purchase.model';
import {
  PURCHASE_STATUSES,
  PURCHASE_STATUS_TONES,
  PurchaseStatus,
} from '../../../models/purchases/purchase-enums';
import { PurchaseService } from '../../../services/purchases/purchase.service';
import { HeadquarterService } from '../../../services/headquarter/headquarter.service';
import { acrossHeadquarters } from '../../../utils/shared/across-headquarters';
import { HeadquarterSummary } from '../../shared/headquarter-summary';
import { PurchaseDialogs } from '../../../services/purchases/purchase-dialogs.service';
import { SessionService } from '../../../services/session/session.service';
import { ToastService } from '../../../services/shared/toast.service';
import { PricePipe } from '../../../pipes/shared/price.pipe';
import { PROCESSOR_DELAY_MS, purchaseErrorMessage, toApiFilters } from '../../../utils/purchases/form-rules';

const MAX_PAGE_SIZE = 100;

@Component({
  selector: 'app-purchase-list',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    UpperCasePipe,
    PricePipe,
    PageHeader,
    KpiCard,
    SortHeader,
    TablePager,
    HeadquarterSummary,
  ],
  templateUrl: './purchase-list.html',
})
export class PurchaseList {
  private readonly purchaseService = inject(PurchaseService);
  private readonly headquarterService = inject(HeadquarterService);
  protected readonly headquarterNames = toSignal(
    this.headquarterService.list().pipe(map((list) => new Map(list.map((headquarter) => [headquarter.id, headquarter.name])))),
    { initialValue: new Map<string, string>() },
  );
  private readonly dialogs = inject(PurchaseDialogs);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly session = inject(SessionService);

  protected readonly statuses = PURCHASE_STATUSES;
  protected readonly tones = PURCHASE_STATUS_TONES;
  protected readonly labelOf = labelOf;

  protected readonly form = this.fb.group({
    status: this.fb.control<PurchaseStatus | null>(null),
    supplierId: this.fb.control<string | null>(null),
    text: [''],
  });
  private readonly filters = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly purchases = signal<Purchase[]>([]);
  protected readonly purchaseHeadquarters = computed(() =>
    this.purchases().map((purchase) => ({ headquarterId: purchase.headquarter.id })),
  );
  protected readonly suppliers = signal<PurchaseSupplierOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly refresh = signal(0);

  private readonly apiFilters = computed(
    () => {
      const headquarterId = this.session.headquarterId();
      if (headquarterId === null) {
        return null;
      }
      const { status, supplierId } = this.filters();
      return toApiFilters(headquarterId, status, supplierId);
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  protected readonly visible = computed(() => {
    const term = this.filters().text.trim().toLowerCase();
    return term === ''
      ? this.purchases()
      : this.purchases().filter((purchase) =>
          purchase.purchaseNumber.toLowerCase().includes(term),
        );
  });

  protected readonly table = createTableState(this.visible, {
    sortKey: 'purchaseDate',
    direction: 'desc',
    accessors: {
      number: (purchase) => purchase.purchaseNumber,
      purchaseDate: (purchase) => Date.parse(purchase.purchaseDate),
      supplier: (purchase) => purchase.supplier.name ?? '',
      total: (purchase) => purchase.total,
      status: (purchase) => purchase.status,
    },
  });

  protected readonly purchaseCount = computed(() => this.visible().length);
  protected readonly totalBought = computed(() =>
    this.sum(this.visible().filter((p) => p.status !== 'CANCELLED'), (p) => p.total),
  );
  protected readonly pendingCount = computed(
    () => this.visible().filter((p) => p.status === 'PENDING').length,
  );
  protected readonly receivedCount = computed(
    () => this.visible().filter((p) => p.status === 'RECEIVED').length,
  );

  constructor() {
    this.purchaseService.listSuppliers().subscribe({
      next: (suppliers) => this.suppliers.set(suppliers),
      error: () => this.suppliers.set([]),
    });

    effect((onCleanup) => {
      this.refresh();
      const filters = this.apiFilters();
      const { status, supplierId } = this.filters();
      this.loading.set(untracked(() => this.purchases().length === 0));
      this.error.set(null);
      const request$ =
        filters === null
          ? acrossHeadquarters(this.headquarterService.list(), (id) =>
              this.purchaseService
                .list({ ...toApiFilters(id, status, supplierId), page: 0, size: MAX_PAGE_SIZE })
                .pipe(map((result) => result.content)),
            )
          : this.purchaseService
              .list({ ...filters, page: 0, size: MAX_PAGE_SIZE })
              .pipe(map((result) => result.content));
      const subscription = request$
        .subscribe({
          next: (content) => {
            this.purchases.set(content);
            this.loading.set(false);
          },
          error: (error: HttpErrorResponse) => {
            this.purchases.set([]);
            this.loading.set(false);
            this.error.set(purchaseErrorMessage(error, 'No se pudieron cargar las compras'));
          },
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected providerName(supplierId: string): string {
    return (
      this.suppliers().find((supplier) => supplier.id === supplierId)?.providerName ?? 'Proveedor'
    );
  }

  protected reload(): void {
    this.refresh.update((value) => value + 1);
  }

  protected clearFilters(): void {
    this.form.reset({ status: null, supplierId: null, text: '' });
  }

  protected create(): void {
    this.dialogs.create().subscribe(() => this.afterCreate());
  }

  private afterCreate(): void {
    this.toast.info('La compra se envió a registrar; el procesador la confirma en un momento');
    setTimeout(() => this.reload(), PROCESSOR_DELAY_MS);
  }

  private sum(purchases: Purchase[], value: (purchase: Purchase) => number): number {
    return purchases.reduce((total, purchase) => total + value(purchase), 0);
  }
}
