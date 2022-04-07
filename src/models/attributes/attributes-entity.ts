// Define the fields we can update
export type AttributesEntityUpdateParams = {
  onSaleCount?: number;
  floorSellValue?: number | null;
  topBuyValue?: number | null;
};

export type AttributesEntityParams = {
  id: number;
  attribute_key_id: number;
  value: string;
  token_count: number;
  on_sale_count: number;
  floor_sell_value: number;
  top_buy_value: number;
};

export class AttributesEntity {
  id: number;
  attributeKeyId: number;
  value: string;
  tokenCount: number;
  onSaleCount: number;
  floorSellValue: number;
  topBuyValue: number;

  constructor(params: AttributesEntityParams) {
    this.id = params.id;
    this.attributeKeyId = params.attribute_key_id;
    this.value = params.value;
    this.tokenCount = params.token_count;
    this.onSaleCount = params.on_sale_count;
    this.floorSellValue = params.floor_sell_value;
    this.topBuyValue = params.top_buy_value;
  }
}
