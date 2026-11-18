import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { HealthPlan } from '../../../models/health-plan/health-plan.model';
import { HealthPlanService } from '../../../services/health-plan/health-plan.service';
import { SessionService } from '../../../services/session/session.service';
import { injectConfirm } from '../../../services/shared/confirm';
import { ToastService } from '../../../services/shared/toast.service';
import { SortHeader } from '../../../directives/shared/sort-header';
import { createTableState } from '../../../utils/shared/table-state';
import { apiErrorMessage } from '../../../utils/shared/api-error';
import { PageHeader } from '../../shared/page-header';
import { TablePager } from '../../shared/table-pager';
import { HealthPlanCoverageModal } from '../health-plan-coverage-modal/health-plan-coverage-modal';

@Component({
  selector: 'app-health-plan-list',
  imports: [RouterLink, PageHeader, SortHeader, TablePager, HealthPlanCoverageModal],
  templateUrl: './health-plan-list.html',
})
export class HealthPlanList {
  private readonly healthPlanService = inject(HealthPlanService);
  private readonly toast = inject(ToastService);
  private readonly confirm = injectConfirm();
  protected readonly session = inject(SessionService);

  protected readonly healthPlans = signal<HealthPlan[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly onlyActive = signal(true);
  protected readonly selectedPlanForCoverage = signal<HealthPlan | null>(null);
  private readonly reload = signal(0);

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.healthPlans()
      .filter((plan) => this.isActive(plan) === this.onlyActive())
      .filter(
        (plan) =>
          term === '' ||
          [plan.name, plan.insuranceCompany, plan.description].some((value) =>
            (value ?? '').toLowerCase().includes(term),
          ),
      );
  });

  protected readonly table = createTableState(this.visible, {
    sortKey: 'name',
    accessors: {
      name: (plan) => plan.name,
      insuranceCompany: (plan) => plan.insuranceCompany,
      status: (plan) => this.isActive(plan),
    },
  });

  constructor() {
    effect((onCleanup) => {
      this.reload();
      this.loading.set(true);
      this.error.set(null);
      const subscription = this.healthPlanService.getHealthPlans().subscribe({
        next: (data) => {
          this.healthPlans.set(Array.isArray(data) ? data : []);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.healthPlans.set([]);
          this.loading.set(false);
          this.error.set(apiErrorMessage(error, 'No se pudieron cargar las pólizas'));
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected isActive(plan: HealthPlan): boolean {
    return plan.status !== 'INACTIVA' && !plan.deleted;
  }

  protected deactivate(plan: HealthPlan): void {
    const id = plan.id;
    if (!id) {
      return;
    }
    this.confirm(
      'Desactivar póliza',
      `"${plan.name}" quedará inactiva y no se podrá asignar a nuevas mascotas.`,
      'Desactivar',
    ).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.healthPlanService.deleteHealthPlan(id).subscribe({
        next: () => {
          this.toast.info(`"${plan.name}" quedó inactiva`);
          this.reload.update((value) => value + 1);
        },
        error: (error: HttpErrorResponse) =>
          this.toast.error(apiErrorMessage(error, 'No se pudo desactivar la póliza')),
      });
    });
  }

  protected openCoverages(plan: HealthPlan): void {
    this.selectedPlanForCoverage.set(plan);
  }

  protected closeCoverages(): void {
    this.selectedPlanForCoverage.set(null);
  }
}
