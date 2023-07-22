export type FeeRecipientEntityParams = {
  id: number;
  domain: string | null;
  address: string;
  createdAt: string;
};

export class FeeRecipientEntity {
  id: number;
  domain: string | null;
  address: string;
  createdAt: string;

  constructor(params: FeeRecipientEntityParams) {
    this.id = params.id;
    this.domain = params.domain;
    this.address = params.address;
    this.createdAt = params.createdAt;
  }
}
