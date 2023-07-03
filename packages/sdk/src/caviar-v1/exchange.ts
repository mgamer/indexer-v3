export class Exchange {
  public async fetchStolenProof(tokenId: string, tokenAddress: string) {
    const reservoirUrl = `https://api.reservoir.tools/oracle/tokens/status/v2?tokens=${tokenAddress}:${tokenId}}`;

    const { messages } = await fetch(reservoirUrl, {
      headers: { "x-api-key": process.env.ORACLE_API_KEY as string },
    }).then((res) => res.json());

    return messages[0].message;
  }
}
