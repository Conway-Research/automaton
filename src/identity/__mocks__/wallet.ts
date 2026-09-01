import type {
  AuthorizationRequest,
  Hash,
  Hex,
  PrivateKeyAccount,
  SerializeTransactionFn,
  SignableMessage,
  TransactionSerializable,
  TypedData,
  TypedDataDefinition,
} from 'viem';
import { SignAuthorizationReturnType } from 'viem/accounts';
import * as mocking from '../wallet.js';

export function getAutomatonDir(): ReturnType<typeof mocking.getAutomatonDir> {
  return 'automatonDir';
}

export function getWalletPath(): ReturnType<typeof mocking.getWalletPath> {
  return 'automatonDir/wallet.json';
}

export function getWallet(): ReturnType<typeof mocking.getWallet> {
  const account: PrivateKeyAccount = {
    address: '0x123456789',
    sign: function (parameters: { hash: Hash }): Promise<Hex> {
      throw new Error('Function not implemented.');
    },
    signAuthorization: function (parameters: AuthorizationRequest): Promise<SignAuthorizationReturnType> {
      throw new Error('Function not implemented.');
    },
    signMessage: function ({ message }: { message: SignableMessage }): Promise<Hex> {
      throw new Error('Function not implemented.');
    },
    signTransaction: function <
      serializer extends SerializeTransactionFn<TransactionSerializable> =
        SerializeTransactionFn<TransactionSerializable>,
      transaction extends Parameters<serializer>[0] = Parameters<serializer>[0],
    >(transaction: transaction, options?: { serializer?: serializer | undefined } | undefined): Promise<Hex> {
      throw new Error('Function not implemented.');
    },
    signTypedData: function <
      const typedData extends TypedData | Record<string, unknown>,
      primaryType extends keyof typedData | 'EIP712Domain' = keyof typedData,
    >(parameters: TypedDataDefinition<typedData, primaryType>): Promise<Hex> {
      throw new Error('Function not implemented.');
    },
    publicKey: '',
    source: 'privateKey',
    type: 'local',
  } as any;
  return Promise.resolve({ account, isNew: true, chainIdentity: {} as any, chainType: "evm" });
}

export function getWalletAddress(): ReturnType<typeof mocking.getWalletAddress> {
  return '0x123456789';
}

export function loadWalletAccount(): ReturnType<typeof mocking.loadWalletAccount> {
  return null;
}

export function walletExists(): ReturnType<typeof mocking.walletExists> {
  return true;
}

// 3TG created 6 mocks in 12 ms @ 2026-03-14T14:23:50.011Z
