// Tiny stack VM (make.fun tiny-stack-vm-01), implementing generator/subject/ISA.md v1.
// For each /input/<id>/program.bin + input.bin, writes /output/<id>/stdout.bin and exit.txt.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function run(prog, input) {
  const mem = new Int32Array(256);
  const st = [];   // data stack, int32 values
  const cs = [];   // call stack, return addresses
  const chunks = [];
  let outLen = 0, pc = 0, steps = 0, ip = 0;
  const n = prog.length;
  const fail = (code) => { throw { code }; };
  const need = (k) => { if (st.length < k) fail(2); };
  const room = () => { if (st.length >= 256) fail(3); };
  const emit = (buf) => { if (outLen + buf.length > 65536) fail(11); chunks.push(buf); outLen += buf.length; };
  const bin = (f) => { need(2); const b = st.pop(), a = st.pop(); st.push(f(a, b)); };
  // Binary operators by opcode. 0x17 NEG and 0x1b NOT are unary (handled in the
  // switch); 0x1f is undefined and must fall through to the trap-5 default.
  const BINOPS = {
    0x10: (a, b) => (a + b) | 0,
    0x11: (a, b) => (a - b) | 0,
    0x12: (a, b) => Math.imul(a, b),
    0x13: (a, b) => b === 0 ? fail(4) : Math.trunc(a / b) | 0,
    0x14: (a, b) => b === 0 ? fail(4) : (a % b) | 0,
    0x15: (a, b) => b === 0 ? fail(4) : Math.trunc((a >>> 0) / (b >>> 0)) | 0,
    0x16: (a, b) => b === 0 ? fail(4) : ((a >>> 0) % (b >>> 0)) | 0,
    0x18: (a, b) => a & b,
    0x19: (a, b) => a | b,
    0x1a: (a, b) => a ^ b,
    0x1c: (a, b) => a << (b & 31),
    0x1d: (a, b) => a >> (b & 31),
    0x1e: (a, b) => (a >>> (b & 31)) | 0,
    0x20: (a, b) => a === b ? 1 : 0,
    0x21: (a, b) => a < b ? 1 : 0,
    0x22: (a, b) => (a >>> 0) < (b >>> 0) ? 1 : 0,
  };
  try {
    for (;;) {
      if (steps >= 1000000) fail(10);
      if (pc < 0 || pc >= n) fail(9);
      const op = prog[pc];
      let imm = 0, size = 1;
      if (op === 0x01) { size = 2; if (pc + 1 >= n) fail(9); imm = (prog[pc + 1] << 24) >> 24; }
      else if (op === 0x02) { size = 5; if (pc + 4 >= n) fail(9); imm = prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24); }
      else if (op >= 0x30 && op <= 0x33) {
        size = 3; if (pc + 2 >= n) fail(9);
        imm = prog[pc + 1] | (prog[pc + 2] << 8);
        if (op !== 0x33) imm = (imm << 16) >> 16;   // CALL's immediate is unsigned
      }
      steps++;
      const next = pc + size;
      const bf = BINOPS[op];
      if (bf !== undefined) { bin(bf); pc = next; continue; }
      switch (op) {
        case 0x00: return { out: Buffer.concat(chunks), code: 0 };
        case 0x01: case 0x02: room(); st.push(imm); pc = next; break;
        case 0x03: need(1); st.pop(); pc = next; break;
        case 0x04: need(1); room(); st.push(st[st.length - 1]); pc = next; break;
        case 0x05: need(2); { const b = st.pop(), a = st.pop(); st.push(b, a); } pc = next; break;
        case 0x06: need(2); room(); st.push(st[st.length - 2]); pc = next; break;
        case 0x07: need(3); { const c = st.pop(), b = st.pop(), a = st.pop(); st.push(b, c, a); } pc = next; break;
        case 0x17: need(1); st.push((-st.pop()) | 0); pc = next; break;
        case 0x1b: need(1); st.push(~st.pop()); pc = next; break;
        case 0x30: pc = next + imm; break;
        case 0x31: need(1); pc = st.pop() === 0 ? next + imm : next; break;
        case 0x32: need(1); pc = st.pop() !== 0 ? next + imm : next; break;
        case 0x33: if (cs.length >= 64) fail(7); cs.push(next); pc = imm; break;
        case 0x34: if (cs.length === 0) fail(8); pc = cs.pop(); break;
        case 0x40: need(1); { const a = st.pop(); if (a < 0 || a > 255) fail(6); st.push(mem[a]); } pc = next; break;
        case 0x41: need(2); { const a = st.pop(), v = st.pop(); if (a < 0 || a > 255) fail(6); mem[a] = v; } pc = next; break;
        case 0x50: need(1); emit(Buffer.from(String(st.pop()))); pc = next; break;
        case 0x51: need(1); emit(Buffer.from([st.pop() & 255])); pc = next; break;
        case 0x52: room(); st.push(ip < input.length ? input[ip++] : -1); pc = next; break;
        case 0x53: need(1); return { out: Buffer.concat(chunks), code: st.pop() & 255 };
        default: fail(5);
      }
    }
  } catch (e) {
    if (e && typeof e.code === 'number') return { out: Buffer.concat(chunks), code: e.code };
    throw e;
  }
}

for (const id of readdirSync(I).sort()) {
  const dir = join(I, id);
  const prog = readFileSync(join(dir, 'program.bin'));
  const inp = join(dir, 'input.bin');
  const { out, code } = run(prog, existsSync(inp) ? readFileSync(inp) : Buffer.alloc(0));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), code + '\n');
}
