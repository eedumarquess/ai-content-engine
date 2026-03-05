import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await deriveScryptKey(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return [
    SCRYPT_PREFIX,
    `N=${SCRYPT_COST},r=${SCRYPT_BLOCK_SIZE},p=${SCRYPT_PARALLELIZATION}`,
    salt,
    derivedKey.toString('hex'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  encodedPassword: string,
): Promise<boolean> {
  const [prefix, params, salt, hash] = encodedPassword.split('$');

  if (prefix !== SCRYPT_PREFIX || !params || !salt || !hash) {
    return false;
  }

  const parsedParams = parseScryptParams(params);
  const expectedHash = Buffer.from(hash, 'hex');
  const derivedKey = await deriveScryptKey(password, salt, expectedHash.length, {
    N: parsedParams.N,
    r: parsedParams.r,
    p: parsedParams.p,
  });

  if (derivedKey.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expectedHash);
}

function parseScryptParams(
  params: string,
): { N: number; r: number; p: number } {
  const values = Object.fromEntries(
    params.split(',').map((part) => {
      const [key, rawValue] = part.split('=');
      return [key, Number(rawValue)];
    }),
  );

  if (
    !Number.isInteger(values.N) ||
    !Number.isInteger(values.r) ||
    !Number.isInteger(values.p)
  ) {
    throw new Error('Invalid scrypt password hash parameters.');
  }

  return {
    N: values.N,
    r: values.r,
    p: values.p,
  };
}

function deriveScryptKey(
  password: string,
  salt: string,
  keyLength: number,
  options: {
    N: number;
    r: number;
    p: number;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}
