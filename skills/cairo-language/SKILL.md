---
name: cairo-language
description: Use when writing Cairo code — type system, ownership, traits, generics, collections, error handling, and module system. Language fundamentals before contract-specific patterns.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [cairo, language, types, traits, generics, ownership, modules, felt252, array, dict]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Cairo Language

Cairo programming language fundamentals.
What you need to know before writing contracts.

> **Next step:** Once you're comfortable with the language, see [cairo-contracts](../cairo-contracts/) for Starknet contract patterns.

## When to Use

- Learning Cairo syntax, types, or ownership model
- Working with generics, traits, or pattern matching
- Understanding felt252, arrays, dicts, or error handling
- Structuring modules and imports

**Not for:** Contract storage/events (use cairo-contracts), components (use cairo-components), testing (use cairo-testing)

## Scarb Project Setup

```bash
# Create a new project
scarb init my_project
cd my_project

# Build
scarb build

# Format
scarb fmt

# Run (standalone Cairo, no Starknet)
scarb cairo-run
```

`Scarb.toml` minimal config:

```toml
[package]
name = "my_project"
version = "0.1.0"
edition = "2024_07"

[dependencies]
starknet = ">=2.12.0"

[[target.starknet-contract]]
```

## Type System

### Primitives

| Type | Description | Example |
|------|-------------|---------|
| `felt252` | Field element (0 ≤ x < P) | `let x: felt252 = 42;` |
| `u8`..`u256` | Unsigned integers | `let n: u128 = 1000;` |
| `i8`..`i128` | Signed integers | `let n: i8 = -5;` |
| `bool` | Boolean | `let b = true;` |
| `()` | Unit type (void) | `fn do_thing() { }` |

### Strings

```cairo
// Short string — max 31 ASCII chars, stored as felt252
let short: felt252 = 'hello';

// ByteArray — arbitrary length string
let long: ByteArray = "this can be any length";
```

### Tuples and Fixed-Size Arrays

```cairo
let tup: (u32, felt252, bool) = (10, 'hi', true);
let (a, b, c) = tup;  // destructure

let arr: [u32; 3] = [1, 2, 3];
let first = arr[0];
```

### Type Conversion

```cairo
// Infallible — always succeeds (widening)
let x: u8 = 5;
let y: u16 = x.into();

// Fallible — may fail (narrowing)
let big: u16 = 500;
let small: u8 = big.try_into().unwrap();  // panics if out of range
let safe: Option<u8> = big.try_into();    // returns None if out of range
```

## Ownership and References

Cairo uses a **linear type system** — every value must be used exactly once unless the type implements `Copy` or `Drop`.

```cairo
#[derive(Drop)]       // can be silently discarded
struct MyStruct { val: u32 }

#[derive(Copy, Drop)]  // can be copied implicitly (like primitives)
struct Point { x: u32, y: u32 }
```

### Snapshots and Refs

```cairo
// Snapshot (@T) — immutable view, does not consume the value
fn read_it(data: @MyStruct) -> u32 {
    *data.val  // desnap with * (only for Copy types)
}

// Ref — mutable borrow
fn mutate_it(ref data: MyStruct) {
    data.val = 10;
}

let mut s = MyStruct { val: 5 };
let _ = read_it(@s);   // pass snapshot
mutate_it(ref s);       // pass mutable ref
```

## Structs

```cairo
#[derive(Drop, Serde, Copy, PartialEq)]
struct Rectangle {
    width: u64,
    height: u64,
}

// Methods via trait + impl
trait RectangleTrait {
    fn area(self: @Rectangle) -> u64;
}

impl RectangleImpl of RectangleTrait {
    fn area(self: @Rectangle) -> u64 {
        *self.width * *self.height
    }
}
```

Common derive macros:
- `Drop` — value can be discarded
- `Copy` — value can be implicitly copied
- `Serde` — serialization (required for contract calldata)
- `PartialEq` — equality comparison
- `Hash` — hashing support
- `starknet::Store` — storable in contract storage
- `starknet::Event` — emittable as event

## Enums and Pattern Matching

```cairo
#[derive(Drop)]
enum Direction {
    North,
    South,
    East: u32,  // variant with data
}

fn describe(d: Direction) -> felt252 {
    match d {
        Direction::North => 'up',
        Direction::South => 'down',
        Direction::East(dist) => 'east',
    }
}
```

### Option and Result

```cairo
// Option<T> — None or Some(value)
let maybe: Option<u32> = Option::Some(42);

match maybe {
    Option::Some(val) => val,
    Option::None => 0,
}

// if-let shorthand
if let Option::Some(val) = maybe {
    // use val
}

// Result<T, E> — Ok(value) or Err(error)
fn divide(a: u32, b: u32) -> Result<u32, felt252> {
    if b == 0 {
        Result::Err('division by zero')
    } else {
        Result::Ok(a / b)
    }
}
```

## Traits and Generics

```cairo
trait Summary<T> {
    fn summarize(self: @T) -> ByteArray;
}

impl RectSummary of Summary<Rectangle> {
    fn summarize(self: @Rectangle) -> ByteArray {
        "a rectangle"
    }
}

// Generic function with trait bounds
fn print_summary<T, +Summary<T>, +Drop<T>>(item: @T) -> ByteArray {
    item.summarize()
}
```

Trait bounds use `+` syntax: `+Drop<T>`, `+Copy<T>`, `+Into<T, U>`.

### Impl of vs Impl for

```cairo
// Named impl with `of` — standard pattern
impl MyImpl of MyTrait<MyType> { ... }

// Can also use `of` with generic impls
impl GenericImpl<T, +Drop<T>> of MyTrait<T> { ... }
```

## Collections

### Array

```cairo
let mut arr: Array<u32> = array![1, 2, 3];
arr.append(4);

let len = arr.len();
let first: Option<u32> = arr.pop_front();  // removes from front
let val: u32 = *arr.at(0);                 // panics if out of bounds
let maybe: Option<@u32> = arr.get(0);      // returns Option

// Span — immutable view of an Array
let span: Span<u32> = arr.span();
```

Arrays are append-only and consume elements on `pop_front`.
Use `Span<T>` to pass arrays without consuming them.

### Felt252Dict

```cairo
let mut dict: Felt252Dict<u64> = Default::default();
dict.insert('key', 100);
let val = dict.get('key');  // returns 100
```

Keys must be `felt252`.
Values must implement `Felt252DictValue` (felt252, u-integers, bool, Nullable<T>).
For complex values, use `Nullable<T>`:

```cairo
let mut dict: Felt252Dict<Nullable<Span<u32>>> = Default::default();
dict.insert('k', NullableTrait::new(array![1, 2].span()));
let val = dict.get('k').deref();
```

## Error Handling

```cairo
// Assert — panics with message if false
assert!(balance >= amount, "insufficient balance");

// Panic — unconditional
panic!("something went wrong");

// Result-based — for recoverable errors
fn safe_div(a: u32, b: u32) -> Result<u32, felt252> {
    if b == 0 { return Result::Err('div by zero'); }
    Result::Ok(a / b)
}

// Unwrap helpers
let val = safe_div(10, 2).unwrap();          // panics on Err
let val = safe_div(10, 2).expect('math err'); // panics with message
```

## Modules

```cairo
// lib.cairo — crate root
mod math;        // loads from math.cairo or math/mod.cairo
mod utils;

// math.cairo
pub fn add(a: u32, b: u32) -> u32 {
    a + b
}

fn private_helper() -> u32 { 0 }  // not pub = private

// main usage
use crate::math::add;      // absolute path from crate root
use super::utils::helper;  // relative path from parent module
```

Visibility: items are private by default.
Use `pub` to make them accessible outside the module.
`pub(crate)` makes items visible within the crate only.

### File Layout Convention

```
src/
  lib.cairo        # mod declarations
  math.cairo       # single-file module
  utils/
    mod.cairo      # multi-file module root
    helpers.cairo   # submodule
```
