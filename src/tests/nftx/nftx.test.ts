import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { getEventsFromTx, wait } from "../utils/test";
import { handleEvents } from "@/events-sync/handlers/nftx";

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { formatEther, parseEther } from "@ethersproject/units";

jest.setTimeout(1000 * 1000);

describe("NFTX", () => {
  // test("MintAndSell", async () => {
  //   const tx = await baseProvider.getTransactionReceipt(
  //     "0x91efac3292db811e6f0e0bfaff178546f903afed3e965ed3c4af0faccd9e4dc5"
  //   );
  //   const events = await getEventsFromTx(tx);
  //   const result = await handleEvents(events);
  //   console.log(result)
  //   // const orderSide = "sell";
  //   // const maker = "0xf16688ea2488c0d41a13572a7399e03069d49a1a";
  //   // const taker = "0x28cd0dfc42756f68b3e1f8883e517e64e474078a";
  //   // const fillEvent = result?.fillEvents?.find(
  //   //   (c) => c.orderSide === orderSide && c.maker === maker && c.taker === taker
  //   // );
  //   // expect(fillEvent).not.toBe(null);
  // });

  test("addLiquidity721ETH", async () => {
    // const tx = await baseProvider.getTransactionReceipt(
    //   "0x815b1644b63a42b5e103cffdd69d7414d52b64b66f53847ebd9cb048bf629ea6"
    // );
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // console.log(result)
    // const taker = "0xda37896e56f12d640230a9e5115756a5cda9a581";
    // const maker1 = "0xdeffc73e9e677e8b42d805e6460b4ef28c53adc3";
    // const maker2 = "0x730aba725664974efb753ee72ca789541c733db4";
    // const orderSide = "sell";
    // const fillEvent1 = result?.fillEvents?.find(
    //   (c) => c.orderSide === orderSide && c.maker === maker1 && c.taker === taker
    // );
    // const fillEvent2 = result?.fillEvents?.find(
    //   (c) => c.orderSide === orderSide && c.maker === maker2 && c.taker === taker
    // );
    // expect(fillEvent1).not.toBe(null);
    // expect(fillEvent2).not.toBe(null);
  });

  test("computePrice", async () => {
    // const tx = await baseProvider.getTransactionReceipt(
    //   "0x815b1644b63a42b5e103cffdd69d7414d52b64b66f53847ebd9cb048bf629ea6"
    // );
    // // 741
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // console.log(result)
    const iface = new Interface([
      "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)",
      "function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)",
    ]);

    const vaultFactoryAddress = "0xBE86f647b167567525cCAAfcd6f881F1Ee558216";
    const vaultId = "392"; //738,746
    const factory = new Contract(
      vaultFactoryAddress,
      ["function vault(uint256 vaultId) external view returns (address)"],
      baseProvider
    );

    const vaultAddress = await factory.vault(vaultId);

    // const vaultAddress = "0x655503aaa60757d3b7afe8be02e20427cb690d6b";
    const vault = new Contract(
      vaultAddress,
      ["function assetAddress() view returns (address)"],
      baseProvider
    );

    const assetAddress = await vault.assetAddress();
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    // console.log("assetAddress", { assetAddress, vaultAddress });

    const sushiRouter = new Contract(
      "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
      iface,
      baseProvider
    );
    // const nftToken = "0x227c7DF69D3ed1ae7574A1a7685fDEd90292EB48";
    try {
      const amounts = await sushiRouter.getAmountsIn(parseEther("1"), [WETH, vaultAddress]);
      // console.log("amounts", {
      //   buyPrice: formatEther(amounts[0]),
      // });
    } catch (e) {}

    try {
      const amounts = await sushiRouter.getAmountsOut(parseEther("1"), [vaultAddress, WETH]);
      // console.log("amounts", {
      //   sellPrice: formatEther(amounts[0]),
      //   sellPrice2: formatEther(amounts[1]),
      // });
    } catch (e) {}
    // const price = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
    // const taker = "0xda37896e56f12d640230a9e5115756a5cda9a581";
    // const maker1 = "0xdeffc73e9e677e8b42d805e6460b4ef28c53adc3";
    // const maker2 = "0x730aba725664974efb753ee72ca789541c733db4";

    // const orderSide = "sell";
    // const fillEvent1 = result?.fillEvents?.find(
    //   (c) => c.orderSide === orderSide && c.maker === maker1 && c.taker === taker
    // );
    // const fillEvent2 = result?.fillEvents?.find(
    //   (c) => c.orderSide === orderSide && c.maker === maker2 && c.taker === taker
    // );

    // expect(fillEvent1).not.toBe(null);
    // expect(fillEvent2).not.toBe(null);
  });
});
