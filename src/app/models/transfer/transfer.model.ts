export type TransferStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// RelatedEntityDTO de la API. El producto llega con name = null.
export interface RelatedEntity {
  id: string;
  name: string | null;
}

// TransferResponseDTO
export interface Transfer {
  id: string;
  originHeadquarter: RelatedEntity;
  destinationHeadquarter: RelatedEntity;
  product: RelatedEntity;
  quantity: number;
  status: TransferStatus;
  observations: string | null;
  createdBy: RelatedEntity;
  createdAt: string;
  updatedBy: RelatedEntity | null;
  updatedAt: string | null;
}

// TransferRequestDTO
export interface TransferRequest {
  originHeadquarterId: string;
  destinationHeadquarterId: string;
  productId: string;
  quantity: number;
  observations: string | null;
}

export interface TransferFilters {
  status?: TransferStatus | null;
  originHeadquarterId?: string | null;
  destinationHeadquarterId?: string | null;
}
