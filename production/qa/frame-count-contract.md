# Encoded-video frame-count contract

The JavaScript encoder's `videoFrameCount` in `src/render-options.mjs` and Python
metadata QA's `video_frame_count` in `media_contract.py` use the same contract:

1. Duration and FPS must be finite, positive binary64 numbers. Strings, booleans,
   null values and other nonnumeric inputs are rejected rather than coerced.
2. Multiply FPS by duration using binary64 arithmetic, then round to the nearest
   integer, with exact nonnegative halves rounded upward, as in `Math.round`.
   This rounds the binary64 product, not an exact decimal interpretation of the
   input. For example, 0.15 seconds at 30 FPS produces 5 frames and 0.35 produces 11.
3. The result must be at least one frame and at most `2**53 - 1`, JavaScript's
   largest safe integer. A sub-frame duration is permitted if it rounds to one.
   A nonfinite product, a zero-frame result or an unsafe integer is rejected.
4. Metadata checks derive their expected duration from `frames / FPS`, matching
   the encoder loop. The requested duration remains the input to quantization.

Python's ties-to-even `round` does not implement this contract. Neither does
`floor(product + 0.5)`: the addition can round a just-below-half value upward and
can push the maximum safe integer out of range. The Python implementation splits
the nonnegative product into its integer part and fraction before deciding
whether to add one.

`tests/fixtures/video-frame-count-contract.json` is the shared, explicitly expected
fixture for both languages. It includes odd/even halves, adjacent representable
values, zero/sub-frame results, fractional FPS, the safe-integer edge, product
overflow/underflow and invalid input types. `tests/media-frame-count.test.mjs`
checks the JS encoder directly and calls Python to compare both implementations;
`tests/test_media_contract.py` checks the same fixture and representative stream
metadata, including rejecting the old 4/10-frame expectations.

These are pure contract and metadata tests. They do not encode video, decode media,
prove audio alignment or replace `verify_media.py`'s full-decode acceptance.
