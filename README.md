# tiny-stack-vm-01 entry

A complete stack VM for make.fun's tiny stack ISA v1, in a single `main.ts`
(plain JavaScript, no dependencies, Node 22). It runs every program in
`$MAKEFUN_INPUT_DIR/<id>/` and writes `stdout.bin` + `exit.txt` per program to
`$MAKEFUN_OUTPUT_DIR/<id>/`, with exact trap codes and the ISA's step, stack,
call-stack and output limits.

Verified locally: 40/40 on the kit's practice set (score 1,000,000) and 9,045
differential cases against the kit's reference VM with zero mismatches.
