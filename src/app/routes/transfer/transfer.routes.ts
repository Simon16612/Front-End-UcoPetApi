import { Routes } from '@angular/router';

import { TransferList } from '../../components/transfer/transfer-list/transfer-list';

export const TRANSFER_ROUTES: Routes = [
  { path: '', component: TransferList, title: 'Traslados · UcoPet' },
];
