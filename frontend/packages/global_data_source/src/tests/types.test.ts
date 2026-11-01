import { describe, expect, test } from "vitest";
import {
	ADT,
	DataTypes,
	Enum,
	F32,
	F64,
	Group,
	I16,
	I32,
	I64,
	Message,
	U16,
	U32,
	U64,
} from "../types.ts";

describe.for([
	{ name: DataTypes.I16, type: I16, min: -32768, max: 32767 },
	{ name: DataTypes.I32, type: I32, min: -2147483648, max: 2147483647 },
	{ name: DataTypes.U16, type: U16, min: 0, max: 65535 },
	{ name: DataTypes.U32, type: U32, min: 0, max: 4294967295 },
])("numeric integer: $name", ({ type, min, max }) => {
	test("range", () => {
		expect(type.from(max).isOk()).toBe(true);
		expect(type.from(min).isOk()).toBe(true);

		expect(type.from(max + 1).isOk()).toBe(false);
		expect(type.from(min - 1).isOk()).toBe(false);
	});

	test("value", () => {
		const n = type.from(min)._unsafeUnwrap();

		expect(n.get()).toBe(min);
		expect(n.checked_set(max).isOk()).toBe(true);
		expect(n.get()).toBe(max);
		expect(n.checked_set(min - 1).isOk()).toBe(false);
		expect(n.get()).toBe(max);
	});

	test("invalid rejection", () => {
		// decimal rejection
		const n = type.from(min)._unsafeUnwrap();
		expect(type.from(min + 0.5).isOk()).toBe(false);
		expect(n.checked_set(max - 0.1).isOk()).toBe(false);
		expect(n.get()).toBe(min);

		// nan rejection
		expect(type.from(NaN).isOk()).toBe(false);
		expect(n.checked_set(NaN).isOk()).toBe(false);
		expect(n.get()).toBe(min);

		// infinity rejection
		expect(type.from(Infinity).isOk()).toBe(false);
		expect(n.checked_set(Infinity).isOk()).toBe(false);
		expect(n.get()).toBe(min);
		expect(type.from(-Infinity).isOk()).toBe(false);
		expect(n.checked_set(-Infinity).isOk()).toBe(false);
		expect(n.get()).toBe(min);
	});
});

describe.for([
	{
		name: DataTypes.I64,
		type: I64,
		min: -9223372036854775808n,
		max: 9223372036854775807n,
	},
	{ name: DataTypes.U64, type: U64, min: 0n, max: 18446744073709551615n },
])("numeric big integer: $name", ({ type, min, max }) => {
	test("range", () => {
		expect(type.from(max).isOk()).toBe(true);
		expect(type.from(min).isOk()).toBe(true);

		expect(type.from(max + 1n).isOk()).toBe(false);
		expect(type.from(min - 1n).isOk()).toBe(false);
	});

	test("value", () => {
		const n = type.from(min)._unsafeUnwrap();

		expect(n.get()).toBe(min);
		expect(n.checked_set(max).isOk()).toBe(true);
		expect(n.get()).toBe(max);
		expect(n.checked_set(min - 1n).isOk()).toBe(false);
		expect(n.get()).toBe(max);
	});
});

describe.for([
	{ name: DataTypes.F32, type: F32, range: Math.fround(3.40282347e38) },
	{ name: DataTypes.F64, type: F64, range: 1.7976931348623157e308 },
])("numeric decimal: $name", ({ type, range }) => {
	test("range", () => {
		expect(type.from(range).isOk()).toBe(true);
		expect(type.from(-range).isOk()).toBe(true);

		expect(type.from(range + 1e300).isOk()).toBe(false);
		expect(type.from(-range - 1e300).isOk()).toBe(false);
	});

	test("value", () => {
		const n = type.from(-range)._unsafeUnwrap();

		expect(n.get()).toBe(-range);
		expect(n.checked_set(range).isOk()).toBe(true);
		expect(n.get()).toBe(range);
		expect(n.checked_set(-range - 1e300).isOk()).toBe(false);
		expect(n.get()).toBe(range);
	});

	test("invalid rejection", () => {
		// decimal rejection
		const n = type.from(-range)._unsafeUnwrap();

		// nan rejection
		expect(type.from(NaN).isOk()).toBe(false);
		expect(n.checked_set(NaN).isOk()).toBe(false);
		expect(n.get()).toBe(-range);

		// infinity rejection
		expect(type.from(Infinity).isOk()).toBe(false);
		expect(n.checked_set(Infinity).isOk()).toBe(false);
		expect(n.get()).toBe(-range);
		expect(type.from(-Infinity).isOk()).toBe(false);
		expect(n.checked_set(-Infinity).isOk()).toBe(false);
		expect(n.get()).toBe(-range);
	});
});

describe(Message, () => {
	const m = new Message("hello world");

	test("Modification", () => {
		expect(m.get()).toBe("hello world");

		m.set("a");
		expect(m.get()).toBe("a");
	});
});

describe(Group, () => {
	const g = new Group();

	test("Add fields", () => {
		g.add_value(I32.from(0)._unsafeUnwrap(), "a", I32.TYPE);
		expect(g[0]).toBeDefined();
		expect(g[0]?.name).toBe("a");

		g.add_value(U32.from(0)._unsafeUnwrap(), "b", I32.TYPE).add_value(
			F32.from(0)._unsafeUnwrap(),
			"c",
			I32.TYPE,
		);

		expect(g.length).toBe(3);
		expect(g[1]?.name).toBe("b");
		expect(g[2]?.name).toBe("c");
	});
});

describe(Enum, () => {
	const e1 = new Enum();

	test("Association", () => {
		e1.associate(1, "a");
		expect(e1.get_variant(1)).toBeTruthy();
		expect(e1.get_variant(1)?.name).toBe("a");

		e1.associate(2, "b");
		expect(e1.get_variant(2)).toBeTruthy();
		expect(e1.get_variant(2)?.name).toBe("b");

		e1.associate(-1, "c");
		expect(e1.get_variant(-1)).toBeTruthy();
		expect(e1.get_variant(-1)?.name).toBe("c");

		e1.associate(-2, "d");
		expect(e1.get_variant(-2)).toBeTruthy();
		expect(e1.get_variant(-2)?.name).toBe("d");
	});

	test("Set variant", () => {
		expect(e1.get_active()).toBe(undefined);

		expect(e1.set_active(1).isOk()).toBe(true);
		expect(e1.get_active()).toBeDefined();
		expect(e1.get_active()?.discriminant).toBe(1);

		const v = e1.get_variant(2);
		expect(e1.set_active(v ?? -100).isOk()).toBe(true);
		expect(e1.get_active()).toBe(v);
	});
});

describe(ADT, () => {
	const e1 = new ADT();

	test("Association", () => {
		e1.associate(1, "a", I32.from(0)._unsafeUnwrap(), I32.TYPE);
		expect(e1.get_variant(1)).toBeTruthy();
		expect(e1.get_variant(1)?.parent).toBe(e1);
		expect(e1.get_variant(1)?.name).toBe("a");
		expect(e1.get_variant(1)?.type).toBe(I32.TYPE);
		expect(e1.get_variant(1)?.value).toEqual(I32.from(0)._unsafeUnwrap());

		e1.associate(2, "b", F32.from(0)._unsafeUnwrap(), F32.TYPE);
		expect(e1.get_variant(2)).toBeTruthy();
		expect(e1.get_variant(2)?.name).toBe("b");
		expect(e1.get_variant(2)?.type).toBe(F32.TYPE);
		expect(e1.get_variant(2)?.value).toEqual(F32.from(0)._unsafeUnwrap());

		e1.associate(-1, "c", new Enum(), Enum.TYPE);
		expect(e1.get_variant(-1)).toBeTruthy();
		expect(e1.get_variant(-1)?.name).toBe("c");
		expect(e1.get_variant(-1)?.type).toBe(Enum.TYPE);
		expect(e1.get_variant(-1)?.value).toEqual(new Enum());

		e1.associate(-2, "d", new ADT(), ADT.TYPE);
		expect(e1.get_variant(-2)).toBeTruthy();
		expect(e1.get_variant(-2)?.name).toBe("d");
		expect(e1.get_variant(-2)?.type).toBe(ADT.TYPE);
		expect(e1.get_variant(-2)?.value).toEqual(new ADT());
	});

	test("Set variant", () => {
		expect(e1.get_active()).toBe(undefined);

		expect(e1.set_active(1).isOk()).toBe(true);
		expect(e1.get_active()).toBeDefined();
		expect(e1.get_active()?.discriminant).toBe(1);

		const v = e1.get_variant(2);
		expect(e1.set_active(v ?? -100).isOk()).toBe(true);
		expect(e1.get_active()).toBe(v);
	});

	test("Modify Value", () => {
		e1.set_active(1)._unsafeUnwrap();
		expect(e1.get_active()?.value).toEqual(I32.from(0)._unsafeUnwrap());

		const v = e1.get_active();
		if (v === undefined) return expect(v).toBeDefined();
		v.value = I32.from(0)._unsafeUnwrap();
		expect(e1.set_active(v).isOk()).toBe(true);

		const v2 = e1.get_variant(-2);
		if (v2 === undefined) return expect(v).toBeDefined();
		(v2.value as ADT)
			.associate(0, "g", new Group(), Group.TYPE)
			.associate(1, "b", U32.from(0)._unsafeUnwrap(), U32.TYPE);
		expect((v2.value as ADT).get_active()).toBe(undefined);
		expect((v2.value as ADT).set_active(0).isOk()).toBe(true);
		((v2.value as ADT).get_active()?.value as Group).add_value(
			I32.from(0)._unsafeUnwrap(),
			"i",
			I32.TYPE,
		);

		expect(e1.get_active()?.discriminant).toBe(1);
		expect(e1.set_active(v2).isOk()).toBe(true);
		expect(
			((e1.get_active()?.value as ADT).get_active()?.value as Group)[0]?.name,
		).toBe("i");
	});
});
