export type AttentionStatus = 'REGISTERED' | 'IN_PROGRESS' | 'CANCELLED' | 'COMPLETED';

export interface VitalSigns {
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  systolicPressure?: number | null;
  diastolicPressure?: number | null;
  weight?: number | null;
  bodyConditionScore?: number | null;
  measurementDate?: string | null;
}

export interface AttentionHealthProduct {
  productId: string;
  quantity: number;
}

export interface AttentionHealth {
  attentionId: number;
  petId: string;
  tutorId: string;
  doctorId: string;
  appointmentId?: string | null;
  headquarterId: string;
  attentionDate: string;
  attentionType: string;
  reason?: string | null;
  clinicalAssessment?: string | null;
  observations?: string | null;
  diagnosis?: string | null;
  status: AttentionStatus;
  vitalSigns?: VitalSigns | null;
  products: AttentionHealthProduct[];
  procedureIds: string[];
}

export type CreateAttentionHealthRequest = Omit<AttentionHealth, 'attentionId'>;

export interface AttentionAppointment {
  id: string;
  tutorId: string;
  petId: string;
  doctorId: string;
  status: string;
  appointmentDate?: string;
  appointmentTime?: string;
  appointmentTypeName?: string;
  doctorName?: string;
}

export interface AttentionTypeOption {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
}
