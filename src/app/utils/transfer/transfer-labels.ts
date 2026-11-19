import { TransferStatus } from '../../models/transfer/transfer.model';

export interface TransferStatusOption {
  value: TransferStatus;
  label: string;
  tag: string;
}

export const TRANSFER_STATUSES: TransferStatusOption[] = [
  { value: 'PENDING', label: 'Pendiente', tag: 'is-warn' },
  { value: 'IN_PROGRESS', label: 'En proceso', tag: 'is-info' },
  { value: 'COMPLETED', label: 'Completado', tag: 'is-ok' },
  { value: 'CANCELLED', label: 'Cancelado', tag: 'is-danger' },
];

export function statusLabel(status: TransferStatus): string {
  return TRANSFER_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function statusTag(status: TransferStatus): string {
  return TRANSFER_STATUSES.find((item) => item.value === status)?.tag ?? 'is-neutral';
}
