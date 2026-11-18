import { Routes } from '@angular/router';
import { AttentionHealthList } from '../../components/attentionhealth/attentionhealth-list/attentionhealth-list';
import { AttentionHealthForm } from '../../components/attentionhealth/attentionhealth-form/attentionhealth-form';
import { AttentionHealthIntake } from '../../components/attentionhealth/attentionhealth-intake/attentionhealth-intake';
export const ATTENTION_HEALTH_ROUTES: Routes = [
  { path: '', component: AttentionHealthList, title: 'Atenciones · UcoPet' },
  { path: 'nueva', component: AttentionHealthIntake, title: 'Seleccionar paciente · UcoPet' },
  { path: 'nueva/atencion', component: AttentionHealthForm, title: 'Nueva atención · UcoPet' },
  {
    path: 'nueva/atencion/:appointmentId',
    component: AttentionHealthForm,
    title: 'Nueva atención · UcoPet',
  },
  {
    path: 'nueva/:appointmentId',
    component: AttentionHealthForm,
    title: 'Nueva atención · UcoPet',
  },
  {
    path: ':attentionId/editar',
    component: AttentionHealthForm,
    title: 'Editar atención · UcoPet',
  },
];
