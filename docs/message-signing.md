# Message signing semantics

Message signing rejects unsupported input rather than silently rewriting it.

## Solana

`solana.signMessage` accepts text or well-formed UTF-8 bytes:

- A `string` is signed as its UTF-8 encoding.
- A `Uint8Array` must contain well-formed UTF-8. Invalid byte sequences are rejected before signing.
- Accepted byte input is decoded without stripping a leading UTF-8 BOM. Embedded NUL bytes, empty input, and all other valid UTF-8 bytes are preserved.

Arbitrary binary messages are not supported. Callers should use `Uint8Array` only when the message is valid UTF-8 and its exact accepted bytes must round-trip unchanged.

## EVM `personal_sign`

EVM personal-message signing distinguishes hex data from text:

- A `0x`-prefixed hex string is decoded and signed as those exact bytes.
- `0x` represents an empty byte sequence.
- Odd-length hex retains compatibility by adding a leading zero nibble before decoding.
- Any other string is signed as its UTF-8 encoding exactly once.

The EIP-191 prefix is applied by the signing service after the SDK supplies the exact message bytes.

The Solana provider passes accepted input through the existing UTF-8 message-signing operation. It does not expose raw-payload signing for arbitrary message bytes.
