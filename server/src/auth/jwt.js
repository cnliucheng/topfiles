import { SignJWT, jwtVerify } from 'jose'

export async function signSession(payload, secret, expiresIn = '7d') {
  return new SignJWT({ sub: 'user:1', ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

export async function verifySession(token, secret) {
  const { payload } = await jwtVerify(token, secret)
  return payload
}
