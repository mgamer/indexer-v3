export type SourcesEntityParams = {
  id: number;
  domain: string;
  name: string;
  address: string;
  metadata: SourcesMetadata;
};

export type SourcesMetadata = {
  adminTitle?: string;
  adminIcon?: string;
  title?: string;
  icon?: string;
  url?: string;
  tokenUrlMainnet?: string;
  tokenUrlRinkeby?: string;
};

export class SourcesEntity {
  id: number;
  name: string;
  domain: string;
  address: string;
  metadata: SourcesMetadata;

  constructor(params: SourcesEntityParams) {
    this.id = params.id;
    this.name = params.name;
    this.domain = params.domain;
    this.address = params.address;
    this.metadata = params.metadata;
  }
}
