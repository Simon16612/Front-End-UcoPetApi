import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

export const QUANTITY_RULES = [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)];

export const OBSERVATIONS_RULES = [Validators.maxLength(500)];

// Origen y destino no pueden ser la misma sede (la API también lo valida).
export const DIFFERENT_HEADQUARTERS: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const origin = group.get('originHeadquarterId')?.value;
  const destination = group.get('destinationHeadquarterId')?.value;
  return origin && destination && origin === destination ? { sameHeadquarter: true } : null;
};
