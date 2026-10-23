import "./topic.ts";
import "./global_data_table.ts";
import { GDT } from "./global_data_table.ts";
import * as RiverDashTypes from "./types.ts";
import { TopicOpenMode } from "./topic.ts";

function test() {
	const _a = GDT.get_topic("hello", TopicOpenMode.Read).match(
		(t) => {
			return t.read_data() as RiverDashTypes.F32;
		},
		(_e) => {
			throw new Error("Bruh");
		},
	);

	new RiverDashTypes.ADT()
		.associate(
			12,
			"name",
			RiverDashTypes.F32.from(12)._unsafeUnwrap(),
			RiverDashTypes.DataTypes.F32,
		)
		.set_active(2);

	GDT.initialize_topic(
		"hellowrold",
		TopicOpenMode.ReadWrite,
		RiverDashTypes.DataTypes.F32,
		RiverDashTypes.F32.from(32)._unsafeUnwrap(),
	);
}

test();
