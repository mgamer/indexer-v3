export type SourcesEntityParams = {
  id: number;
  metadata: SourcesMetadata;
};

export type SourcesMetadata = {
  address: string;
  name: string;
  icon?: string | null;
  url?: string | null;
  urlMainnet?: string | null;
  urlRinkeby?: string | null;
};

export class SourcesEntity {
  id: number;
  name: string;
  address: string;
  metadata: SourcesMetadata;

  constructor(params: SourcesEntityParams) {
    this.id = params.id;
    this.name = params.metadata.name;
    this.address = params.metadata.address;
    this.metadata = params.metadata;
  }
}
