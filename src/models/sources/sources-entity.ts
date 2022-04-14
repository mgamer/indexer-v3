export type SourcesEntityParams = {
  id: number;
  name: string;
  address: string;
  metadata: SourcesMetadata;
};

export type SourcesMetadata = {
  icon?: string | null;
  url?: string | null;
  tokenUrlMainnet?: string | null;
  tokenUrlRinkeby?: string | null;
};

export class SourcesEntity {
  id: number;
  name: string;
  address: string;
  metadata: SourcesMetadata;

  constructor(params: SourcesEntityParams) {
    this.id = params.id;
    this.name = params.name;
    this.address = params.address;
    this.metadata = params.metadata;
  }
}
