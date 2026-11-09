# Global Data Table

This is the shared data source and data manager for RiverDash.

See [Usage](#usage) for examples and [Documentation](#documentation)
for generated API references.

# Installation

Add the following to your `package.json`:

```
	"@river-dash/global-data-source": "^1.0.0"
```

then run `npm install`

# Compilation

run `npm run build` to compile all files into "./dist".

Build this workspace before importing it from another project; package
exports point to compiled files in `dist/`.

# Documentation

To compile documentation, run: `npm run doc`.

Then open "./docs/index.html" in a browser.

If links in the generated documentation fail, try opening the generated
`index.html` file directly in a browser.

# Usage:

Global Data table is based on the concept of a Publisher / Subscriber
architecture. A more specific form of Observer.

A Publisher publishes a Topic. And a Subscriber subscribes to that
topic and reads (or write) data from(to) it.

### Topic

A topic is some piece of data referenced by a name. A topic can be
opened in either of 3 modes:

1.  `Read` - Data can be read out from a topic. This is most of your
    value streams, logs and other broadcast type data.
2.  `ReadWrite` - Data can be read and write from a topic. This is
    your mode selectors, states, events data. Only a singular
    `ReadWrite` instance can be active if a topic has this mode (1 to
    Many).
3.  `ReadWriteMany` - Similar to `ReadWrite`, but now you can have
    multiple writers. This is your log messages and anything broad cast
    message. Using `ReadWriteMany` means that the latest timestamp may
    no longer be the latest across the entire network. You are
    guaranteed to receive data and a timestamp associated with said
    data. But _YOU are not guaranteed to have the latest data._ Use
    `ReadWriteMany` only when you don't care about synchronization and
    order of data.

#### Why use a Topic over JS primitives or REACT mechanisms:

1. Topic updates can be propagated to other peers **when a real network
   transport and synchronization are connected**. That allows multiple
   windows or devices to share data, but it is not automatic. The current
   `TransportNothing` does not send messages over a network, and River Dash's
   browser-local mock stand is not synchronized between viewers.

2. You don't have to worry about the representation of data. Anything
   published over a Topic is basically a direct translation of NILE-stand
   data. So as long as you use the provided constraint methods (see Types
   documentation), you will be providing valid data to NILE stand.

3. The topic system provides serialization and schema validation. A valid
   message shape does not imply that a sensor reading is accurate or that
   the transport delivered the message successfully.

There are obviously some drawbacks to this architecture, namely:

1. Propagating updates over an active network transport incurs a cost;
   local-only topics avoid that transport overhead.
2. You are writing more code, and also wrapping data in more objects.
   These actions introduce a performance penalty. In the grand scheme
   of things it's not much. But it will eventually add up if you are
   say updating an topic in a hot loop non stop.

Consider topics for cross-module data sharing. Within a single React module,
prefer ordinary React state and props unless topic semantics are needed.

### DataTypes

Each Topic have a string name and a [`Temporal.Instant`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant) time stamp.
The topic represents some piece of data. The available data types
are:

| Name                | Purpose                               |
| ------------------- | ------------------------------------- |
| `U16`, `U32`, `U64` | Unsigned Integers                     |
| `I16`, `I32`, `I64` | Signed Integers                       |
| `F32`, `F64`        | Floating Point Decimals               |
| `Message`           | Textual / JSON Data                   |
| `Enum`              | Enumeration with named discriminants  |
| `ADT`               | Tagged Union with named Data variants |
| `Group`             | A collection of Data                  |
| `Record`            | A structured collection of Data       |

`ADT`, `Group` and `Record` may contain any types listed above.
That means you can have a `Group` of a `Group` and `ADT`. With the
sub-`Group` containing a bunch of `F32`s.

All of the numerical types also have checked(constrained) write
methods. Use them to keep numeric values within their representable ranges.

See `src/types.ts` for type-specific constraints.

### GlobalDataTable - `GDT`

The `GlobalDataTable` is a registry of all topics that exists. There is
a global instance (singleton) called `GDT`. You call methods on this
singleton in order to get / initialize topics.

In addition, `GlobalDataTable` also provide events for topic
declaration and initialization. Both of which you can subscribe to in
order to know when your topic have started existing.

Topics are "declared" across the network when it is initially created.
A declared topic may not have data yet. In which opening the topic in
any of `Read`, `ReadWrite` or `ReadWriteMany` will fail. Once a topic
is initialized with data, then you can open them in the appropriate
modes. When calling `initialize_topic`, you may specify a initialization
timestamp. Then the `init_data_or_declaration` parameter will be treated
as an valid init value. If not, then `init_data_or_declaration` will be
treated as a declaration of what is contained in the topic. In which any
data contained in it is treated as invalid.

### Common Usage of GDT - Topics

1. Receiving telemetry value stream from NILE Stand
   1. Listen for an topic initialize event for your target topic.
   2. Open your target topic in `Read` mode.
   3. Subscribe to topic and listen for value update event.
   4. Update UI / Perform calculations based on update.
   - Note: You may need to do additional processing on `Group`,`Record` or `ADT`.
     As they can be deeply nested with actual values contained with in.
2. Sharing Application State
   1. Declare a new topic with `ReadWrite` and peer `Read`.
   2. Initialize the topic using the returned `ReadWrite` instance.
      If you haven't pass in a valid init value and ts when creating the topic.
   3. Then write to your topic every time you have changed a state.
   - all of your peers that need to read the state then can follow
     the steps for receiving a telemetry value stream to also receive
     the application state
   - Some times you are supposed to write a state, but are not
     supposed to declare/init it. In which case then you can listen
     for a topic init event. Then open the topic. It is always the
     topic's declarer's responsibility to init a topic, even if they
     are expecting primarily others to write to it. (ie:
     `initialize_topic` as `Read` and peer mode `ReadWrite`(`Many`),
     Then pass in valid init data and time stamp).
3. Multi Producer Multi Consumer system (messages / logs)
   1. Declare a new topic with `ReadWriteMany` and same for peers,
      while also initializing the topic on creation.
   2. Open topic as `ReadWriteMany` using `get_topic`.
   3. Write data to the topic if your a producer.
      Read data from it if you are a consumer.
   - You are not guaranteed any kind of order when using
     `ReadWriteMany` or if you and the peers all have write
     permissions. Eventual consistency is guaranteed and timestamps
     will be accurate per update.

### Examples:

1. Subscribing / Getting / Writing Data:

```js
const [topic, setTopic] = useState<TopicRead<F32> | undefined>(undefined);
const [state, setState] = useState(0);

// effect for getting an event
useEffect(() => {
	return EventTopicInitialized.add_listener_to(GDT,
		(e: EventTopicInitialized) => {
			// check if the topic you want got initialized
			if (e.m_info.name !== "Topic Name") return;

			// get topic
			const topic = GDT.get_topic(
				e.m_info.name,
				TopicOpenMode.Read)
			.match(
				(t) => t,
				(e) => console.log(e),
			);
			if (topic == undefined) return;

			// set topic
			setTopic(topic as TopicRead<F32>);
		}
	);
});

// effects for getting new event data
useEffect(() => {
	// if no topic
	if (topic == undefined) return;

	return EventTopicUpdate.add_listener_to<F32>(topic, (e) => {
		// sets state
		setState(e.m_data.get());

		// or do something else with data
	});
}, [topic]);
```

2. Publishing / Declaring Topic

```js
// declare a topic but don't init it yet
const topic: TopicRW<F32> = GDT.initialize_topic(
	"Topic Name",
	TopicOpenMode.ReadWrite,
	DataTypes.F32,
	F32.from(0)._unsafeUnwrap(),
	undefined,
	TopicOpenMode.Read,
);

// declare a topic and also init it
const topic: TopicRW<F32> = GDT.initialize_topic(
	"Topic Name",
	TopicOpenMode.Read,
	DataTypes.F32,
	F32.from(0)._unsafeUnwrap(),
	Temporal.Now.instant(),
	TopicOpenMode.ReadWrite,
);
```

Then follow instructions for subscribing / writing data
