#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bounded Integer Implementation Calculator

Computes exact type bounds for Cairo BoundedInt helper trait implementations.
Outputs ready-to-paste Cairo code.

Original author: feltroidprime (https://github.com/feltroidprime/cairo-skills)

Usage:
    python3 bounded_int_calc.py add <a_lo> <a_hi> <b_lo> <b_hi> [--name NAME]
    python3 bounded_int_calc.py sub <a_lo> <a_hi> <b_lo> <b_hi> [--name NAME]
    python3 bounded_int_calc.py mul <a_lo> <a_hi> <b_lo> <b_hi> [--name NAME]
    python3 bounded_int_calc.py div <a_lo> <a_hi> <b_lo> <b_hi> [--name NAME]
"""

import argparse
import sys

# felt252 prime (for validation)
FELT252_PRIME = 0x800000000000011000000000000000000000000000000000000000000000001


def validate_felt252(value: int, name: str) -> None:
    """Warn if value exceeds felt252 range."""
    if value < 0:
        # Negative values are represented as P - |value| in felt252
        if abs(value) >= FELT252_PRIME:
            print(f"WARNING: {name} = {value} exceeds felt252 range!", file=sys.stderr)
    elif value >= FELT252_PRIME:
        print(f"WARNING: {name} = {value} exceeds felt252 range!", file=sys.stderr)


def format_bound(value: int) -> str:
    """Format a bound value, handling negatives."""
    if value < 0:
        return str(value)
    return str(value)


def calc_add(a_lo: int, a_hi: int, b_lo: int, b_hi: int) -> tuple:
    """Calculate addition bounds: [a_lo + b_lo, a_hi + b_hi]"""
    result_lo = a_lo + b_lo
    result_hi = a_hi + b_hi
    return result_lo, result_hi


def calc_sub(a_lo: int, a_hi: int, b_lo: int, b_hi: int) -> tuple:
    """Calculate subtraction bounds: [a_lo - b_hi, a_hi - b_lo]"""
    result_lo = a_lo - b_hi
    result_hi = a_hi - b_lo
    return result_lo, result_hi


def calc_mul(a_lo: int, a_hi: int, b_lo: int, b_hi: int) -> tuple:
    """
    Calculate multiplication bounds.
    For unsigned: [a_lo * b_lo, a_hi * b_hi]
    For signed/mixed: evaluate all corners.
    """
    corners = [
        a_lo * b_lo,
        a_lo * b_hi,
        a_hi * b_lo,
        a_hi * b_hi,
    ]
    return min(corners), max(corners)


def calc_div(a_lo: int, a_hi: int, b_lo: int, b_hi: int) -> tuple:
    """
    Calculate division bounds.
    Quotient: [a_lo // b_hi, a_hi // b_lo]
    Remainder: [0, b_hi - 1]

    Note: Cairo's bounded_int_div_rem requires non-negative dividends.
    """
    if b_lo <= 0:
        print(
            "ERROR: Divisor lower bound must be positive!",
            file=sys.stderr,
        )
        sys.exit(1)

    if a_lo < 0:
        print(
            "ERROR: Dividend lower bound must be non-negative! "
            "Cairo's bounded_int_div_rem does not support negative dividends.",
            file=sys.stderr,
        )
        sys.exit(1)

    quot_lo = a_lo // b_hi
    quot_hi = a_hi // b_lo
    rem_lo = 0
    rem_hi = b_hi - 1

    return (quot_lo, quot_hi), (rem_lo, rem_hi)


def generate_add_impl(
    a_lo: int, a_hi: int, b_lo: int, b_hi: int, name: str
) -> str:
    result_lo, result_hi = calc_add(a_lo, a_hi, b_lo, b_hi)

    validate_felt252(result_lo, "Result min")
    validate_felt252(result_hi, "Result max")

    return (
        f"impl {name} of AddHelper<"
        f"BoundedInt<{format_bound(a_lo)}, {format_bound(a_hi)}>, "
        f"BoundedInt<{format_bound(b_lo)}, {format_bound(b_hi)}>> {{\n"
        f"    type Result = BoundedInt<"
        f"{format_bound(result_lo)}, {format_bound(result_hi)}>;\n"
        f"}}"
    )


def generate_sub_impl(
    a_lo: int, a_hi: int, b_lo: int, b_hi: int, name: str
) -> str:
    result_lo, result_hi = calc_sub(a_lo, a_hi, b_lo, b_hi)

    validate_felt252(result_lo, "Result min")
    validate_felt252(result_hi, "Result max")

    return (
        f"impl {name} of SubHelper<"
        f"BoundedInt<{format_bound(a_lo)}, {format_bound(a_hi)}>, "
        f"BoundedInt<{format_bound(b_lo)}, {format_bound(b_hi)}>> {{\n"
        f"    type Result = BoundedInt<"
        f"{format_bound(result_lo)}, {format_bound(result_hi)}>;\n"
        f"}}"
    )


def generate_mul_impl(
    a_lo: int, a_hi: int, b_lo: int, b_hi: int, name: str
) -> str:
    result_lo, result_hi = calc_mul(a_lo, a_hi, b_lo, b_hi)

    validate_felt252(result_lo, "Result min")
    validate_felt252(result_hi, "Result max")

    return (
        f"impl {name} of MulHelper<"
        f"BoundedInt<{format_bound(a_lo)}, {format_bound(a_hi)}>, "
        f"BoundedInt<{format_bound(b_lo)}, {format_bound(b_hi)}>> {{\n"
        f"    type Result = BoundedInt<"
        f"{format_bound(result_lo)}, {format_bound(result_hi)}>;\n"
        f"}}"
    )


def generate_div_impl(
    a_lo: int, a_hi: int, b_lo: int, b_hi: int, name: str
) -> str:
    (quot_lo, quot_hi), (rem_lo, rem_hi) = calc_div(a_lo, a_hi, b_lo, b_hi)

    validate_felt252(quot_lo, "Quotient min")
    validate_felt252(quot_hi, "Quotient max")
    validate_felt252(rem_lo, "Remainder min")
    validate_felt252(rem_hi, "Remainder max")

    return (
        f"impl {name} of DivRemHelper<"
        f"BoundedInt<{format_bound(a_lo)}, {format_bound(a_hi)}>, "
        f"BoundedInt<{format_bound(b_lo)}, {format_bound(b_hi)}>> {{\n"
        f"    type DivT = BoundedInt<"
        f"{format_bound(quot_lo)}, {format_bound(quot_hi)}>;\n"
        f"    type RemT = BoundedInt<"
        f"{format_bound(rem_lo)}, {format_bound(rem_hi)}>;\n"
        f"}}"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Calculate BoundedInt helper trait implementations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Addition: [0, 12288] + [0, 12288]
    python3 bounded_int_calc.py add 0 12288 0 12288

    # Subtraction: [0, 12288] - [0, 12288]
    python3 bounded_int_calc.py sub 0 12288 0 12288

    # Multiplication: [0, 12288] * [0, 12288]
    python3 bounded_int_calc.py mul 0 12288 0 12288

    # Division: [128, 255] / [3, 8]
    python3 bounded_int_calc.py div 128 255 3 8

    # Custom impl name
    python3 bounded_int_calc.py mul 0 12288 0 12288 --name Zq12289MulHelper
        """,
    )

    subparsers = parser.add_subparsers(dest="operation", required=True)

    for op_name, op_help, default_name in [
        ("add", "Addition: [a_lo, a_hi] + [b_lo, b_hi]", "AddImpl"),
        ("sub", "Subtraction: [a_lo, a_hi] - [b_lo, b_hi]", "SubImpl"),
        ("mul", "Multiplication: [a_lo, a_hi] * [b_lo, b_hi]", "MulImpl"),
        ("div", "Division: [a_lo, a_hi] / [b_lo, b_hi]", "DivRemImpl"),
    ]:
        sub = subparsers.add_parser(op_name, help=op_help)
        sub.add_argument("a_lo", type=int, help="Lower bound of first operand")
        sub.add_argument("a_hi", type=int, help="Upper bound of first operand")
        sub.add_argument("b_lo", type=int, help="Lower bound of second operand")
        sub.add_argument("b_hi", type=int, help="Upper bound of second operand")
        sub.add_argument(
            "--name", default=default_name, help="Name for the impl"
        )

    args = parser.parse_args()

    generators = {
        "add": generate_add_impl,
        "sub": generate_sub_impl,
        "mul": generate_mul_impl,
        "div": generate_div_impl,
    }

    print(generators[args.operation](args.a_lo, args.a_hi, args.b_lo, args.b_hi, args.name))


if __name__ == "__main__":
    main()
