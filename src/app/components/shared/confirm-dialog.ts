import { Component, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

export type ConfirmTone = 'danger' | 'primary';

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="modal-body text-center p-4">
      <span class="uc-mark is-lg mb-3" [class.is-danger]="tone() === 'danger'"
        ><i
          class="bi"
          [class.bi-exclamation-triangle-fill]="tone() === 'danger'"
          [class.bi-question-circle-fill]="tone() === 'primary'"
        ></i
      ></span>
      <h2 class="h5 mb-2">{{ title() }}</h2>
      <p class="text-body-secondary mb-0">{{ message() }}</p>
    </div>
    <div class="modal-footer justify-content-center">
      <button type="button" class="btn btn-light" (click)="modal.dismiss()">Cancelar</button>
      <button
        type="button"
        class="btn"
        [class.btn-danger]="tone() === 'danger'"
        [class.btn-primary]="tone() === 'primary'"
        (click)="modal.close(true)"
      >
        {{ confirmLabel() }}
      </button>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly modal = inject(NgbActiveModal);
  readonly title = signal('');
  readonly message = signal('');
  readonly confirmLabel = signal('Confirmar');
  readonly tone = signal<ConfirmTone>('danger');
}
