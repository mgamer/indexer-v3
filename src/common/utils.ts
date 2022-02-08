import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { formatEther } from "@ethersproject/units";

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const formatEth = (wei: BigNumberish) =>
  Number(Number(formatEther(wei)).toFixed(5));

export const fromBuffer = (buffer: Buffer) => "0x" + buffer.toString("hex");

export const toBuffer = (hexValue: string) =>
  Buffer.from(hexValue.slice(2), "hex");

// Mostly used as described in:
// https://github.com/taskforcesh/bullmq/issues/652#issuecomment-984840987
export const manualTimeout = (fn: () => Promise<any>, millis: number) =>
  new Promise(async (resolve, reject) => {
    try {
      const timeout = setTimeout(() => reject(new Error("timeout")), millis);

      await fn();

      clearTimeout(timeout);
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
