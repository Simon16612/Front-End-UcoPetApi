import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { Headquarter } from '../../models/headquarter/headquarter.model';
import { HeadquarterService } from '../../services/headquarter/headquarter.service';
import { SessionService } from '../../services/session/session.service';

@Component({
  selector: 'app-headquarter-summary',
  template: `
    @if (session.headquarterId() === null && counts().length > 0) {
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3 small">
        <span class="text-body-secondary">{{ label() }} por sede:</span>
        @for (entry of counts(); track entry.id) {
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary rounded-pill py-0"
            [title]="'Ver solo ' + entry.name"
            (click)="session.selectHeadquarter(entry.id)"
          >
            {{ entry.name }} <b>{{ entry.count }}</b>
          </button>
        }
      </div>
    }
  `,
})
export class HeadquarterSummary {
  protected readonly session = inject(SessionService);
  private readonly headquarters = toSignal(
    inject(HeadquarterService)
      .list()
      .pipe(catchError(() => of([] as Headquarter[]))),
    { initialValue: [] as Headquarter[] },
  );

  readonly items = input<readonly { headquarterId?: string | null }[]>([]);
  readonly label = input('Registros');

  protected readonly counts = computed(() => {
    const totals = new Map<string, number>();
    for (const item of this.items()) {
      if (item.headquarterId) {
        totals.set(item.headquarterId, (totals.get(item.headquarterId) ?? 0) + 1);
      }
    }
    return this.headquarters()
      .filter((headquarter) => totals.has(headquarter.id))
      .map((headquarter) => ({ id: headquarter.id, name: headquarter.name, count: totals.get(headquarter.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}
