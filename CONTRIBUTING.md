# Contributing

Hello there, welcome to the contributing guide & guidelines for contributing to River Dash.

First off, thank you for your interest in working on River Dash and all of it's associated components. Welcome!

This file describes pretty much all you need to know to begin contributing to River Dash. The River Dash project is governed by our [Contributor License Agreement](##Contributor-License-Agreement). **_Please Please Please_** make sure you read this agreement before contributing. You can find out more details in the [How to Contribute](##how-to-contribute) section.

**If this is the first time you are contributing to River Dash or any of it's components, PLEASE add your name and email to [contributors.md](./contributors.md) to show that you have read and agreed to this contribution guideline.**

Aside from that, most of what's here is more so guidelines than rules. If you have any suggestions, please let us know through a new pull request!

## What Should You Know Before Contributing

### OS Development Environment

Due to the nature of River Dash tooling and also the targets that River Dash need to support. We have made the choice to use Linux and other \*unix like operating systems as our development environment.

You shouldn't need to install any additional OS level packages and tools beyond a code editor and the things mentioned in the next [Tools & Languages](#tools--languages) section.

We recommend using WSL2 with a mainstream distro if you are on Windows. Unless you wish to manually run tooling, which we wouldn't wish upon anyone.

### Tools & Languages

The River Dash project uses multiple different programming languages and tools. Depending on which component you want to contribute to, you might need drastically different tooling.

For the Frontend, we use:

1. Typescript & REACT
2. Node JS with Vite and NPM
3. Prettier and ESLint

For the Backend, we use:

1. RUST with Cargo
2. rustfmt

For General Tooling & Development scripts, we use:

1. Bash

We recommend you make sure you have the right toolset installed before you start development. Editor-wise anything that edits text should work as all of our tooling can all run on \*unix command line.

## How to Contribute

There are many ways to contribute to River Dash. In this section we'll cover two main ways to contribute: Bug Reporting and Developing Code/Features.

### Bug Reporting

Bug reports are a big part of how we find out what's wrong with River Dash. It can be as important as submitting new features or writing code!

All of our bugs are tracked via GitHub Issues. Before you submit a bug, we recommend you check out our Issues pages. Or hit up the all mighty search engines or AI LLM services to see if there is already solutions to your issue.

More than often you'll find that someone else have already experienced your issue. In which case it will be more effective to add your details to the conversation so our developers can better understand what's going on.

If you happen to encounter a brand new bug, congratulations! You are the chosen one! Now to write a bug report, please provide **as much detail as possible**. Explain the problem and include additional details to help maintainers reproduce the problem. Consider including these items:

1. **A clear and descriptive title** so the issue can be easily categorized and identified.
2. **Provide specific steps to recreating your problem / cause the problem to happen**. This is so that the issue can be recrated by maintainers and tested against.
3. **Provide information on your environment**. Your OS, what version of River Dash you are using, what browser/nodejs version/platform did you run River Dash on.
4. **Add a video or screenshots or text logs**. These help us visually identify what the bug is and can give us a better understanding of how to fix it.

### Writing Code

River Dash is currently under heavy active development. If you wish to work on a new feature, take a look at what's in Projects, and find something interesting that you want to work on. Once you do, create a tracking issue for it in Issues so people know you are working on that. Then start coding!

OR you may simply take a look at issues and look at what bugs have been reported and what still needs fixing. Once you have made a choice, then comment on that issue to let people know you are working on it. Then start looking into the code for what might be wrong and need to be changed.

Here's the typical steps associated with development:

1. Install all the necessary associated tooling and set up your environment to match everything mentioned in [Tools & Languages](#tools--languages) so you can start writing code.
2. Familiarize yourself with the section of code base you are working on.
3. Start writing code and start testing your code
   - For JS/TS/NPM package, within each of the packages you are using. run `npm run dev` to start a development GUI build.

   - For Rust code, run `cargo run` or `cargo test`. to run or unit test the Rust code.

4. Make sure you are following the appropriate [Style Guidelines](#style-guidelines) for each section of the code; and also our [General Coding Conventions](#general-coding-conventions)
5. After verifying the code work, commit your work with a commit message
   - The `./commit` script is a helper script that runs formatting and checks before you commit. You can use it as `./commit -m "commit message"`. Or run it empty as `./commit` if you just want to run pre commit formats and checks. We recommend running this script before committing.
   - **If this is the first time you are contributing to River Dash or any of it's components, PLEASE add your name and email to [contributors.md](./contributors.md) to show that you have read and agreed to this contribution guideline.**
6. Finally, push to your forked repo or the development branch you have been given access to. Then open a pull request when you are ready to be merge into the mainline branches.

## Style Guidelines

There are a few rules that we follow here to make sure River Dash stay high quality

### General Coding Conventions

1. Name items in reverse priority order (aka generalized reverse DNS order). That is to name thing with less specific nouns/specifiers first. Then go on to more detail. Ex: `api_get_timestamp()` This function gets a timestamp from the API. The most generalized specifier for what this function does is that it interacts with the API, so `API` goes first. Then followed by `get` and finally what it's actually getting: `timestamp`. This is somewhat subjective. If you are writing code for an already existing module, try and fit into the naming conventions there. But generally names should follow this style so their intention could easily be inferred; and their names be easily suggested by intellisense.
2. No deep nesting of code. We follow a similar amount of indention/nesting requirement as the linux kernel: No more than 4 levels of indention/nesting unless in special circumstances. High levels of nesting makes code hard to read and debug. There are ways to avoid nesting, such as:
   - Using IF guards: `if (condition) return;`. Use your function as a quick way to exit out if a terminating condition occurs. Instead of nesting `if-else` blocks. The same pattern can also be applied to `break` and `continue` in loops.
   - Lifting deep loops out as discrete functions
   - Use language specific notation that reduce nesting: Such as Rust's try operator: `?` that checks a `Result<V,E>` and exits the outer function with a `Err<E>` if `Result` is `Err`
3. All functions must be documented. At least a one liner comment is expected for a function. Typically we want a short paragraph describing what the function does and how to use it. Each language have their own way documenting functions. Please follow their conventions.
4. Explicitly state units. Ideally through a type that describes what that unit is. ie: `Meters` and `MetersPerSecond` type. If a type is not used, then post-pend the shorthand for the unit to the variable/function: `api_get_timestamp_ms()`.
5. Test your code. Don't push it if it hasn't at least gone through several rounds of testing. If automated testing is possible, then do so. If not, our eye balls are a great tool waiting to be used.
6. Use actively maintained packages if you are adding a dependency. Please add a description for why a new dependency must be introduced.

These are just the general guidelines. If you really want to write good code, I recommend you follow [NASA's Power of 10](https://web.eecs.umich.edu/~imarkov/10rules.pdf) coding rules as much as you can and as much as applicable, but this's not enforced or is it necessary for River Dash.

### Javascript/Typescript Guidelines

1. All Javascript/Typescript must pass `ESLint` and `Prettier`'s formatting and lint tests. Use `./commit` script to automatically run the checks on commit. Or set up your editor to automatically run them on save (By default we have set up VSCode to do this if you have the correct extensions).
2. JS/TS code should not produce runtime errors in the dev console. All code should run without errors unless it's caused by network failure. In which case it should be gracefully handled.

### Rust Guidelines

1. All Rust must pass `rustfmt`'s formatter/linter checks, and also compile without any warning or errors. Use `./commit` script to automatically run the checks on commit. Or set up your editor to automatically run them on save (By default we have set up VSCode to do this if you have the correct extensions).
2. All errors must be handled gracefully. The Rust code must not panic except OOM or panic resulting from a `Result::expect()`. `Result::unwarp` or any of it's sister function must not be used. Use a `Result::expect` if something really is unexpected and the program must terminate if the `Result` isn't `Ok`. If not, handle the errors gracefully and return an `ErrorType` upstream. Don't use `Result::expect` if there's another option that doesn't involve a panic.
3. `unsafe` Rust code must be marked with a `//SAFETY: ...` comment describing why it's fine. Don't use unsafe unless it's really needed.

## Contributor License Agreement

Individual Contributor Non-Exclusive License Agreement including the Traditional Patent License

Thank you for your interest in contributing to this repository ("We" or "Us").

The purpose of this contributor agreement ("Agreement") is to clarify and document the rights granted by contributors to Us. By submitting comments or code to the project you are deemed to have accepted this agreement.

This License Agreement is a derivative of [openownership's datastandard contribution license](https://github.com/openownership/data-standard/blob/e8cc3fd7a7fe45c7ad3b542dc07a99847a7960aa/CONTRIBUTING.md). With an addition of allowing for private commercial licensing to for-profit organizations. And other minor changes.

1. DEFINITIONS

"You" means the Individual Copyright owner who submits a Contribution to Us. If You are an employee and submit the Contribution as part of your employment, You have had Your employer approve this Agreement or sign the Entity version of this document.

"Contribution" means any original work of authorship (software and/or documentation) including any modifications or additions to an existing work, Submitted by You to Us, in which You own the Copyright. If You do not own the Copyright in the entire work of authorship, please contact Us at tbc.

"Copyright" means all rights protecting works of authorship owned or controlled by You, including copyright, moral and neighboring rights, as appropriate, for the full term of their existence including any extensions by You.

"Material" means the software or documentation made available by Us to third parties. When this Agreement covers more than one software project, the Material means the software or documentation to which the Contribution was Submitted. After You Submit the Contribution, it may be included in the Material.

"Submit" means any form of physical, electronic, or written communication sent to Us, including but not limited to electronic mailing lists, source code control systems, and issue tracking systems that are managed by, or on behalf of, Us, but excluding communication that is conspicuously marked or otherwise designated in writing by You as "Not a Contribution."

"Submission Date" means the date You Submit a Contribution to Us.

"Documentation" means any non-software portion of a Contribution.

2. LICENSE GRANT

2.1 Copyright License to Us

Subject to the terms and conditions of this Agreement, You hereby grant to Us a worldwide, royalty-free, NON-exclusive, perpetual and irrevocable license, with the right to transfer an unlimited number of non-exclusive licenses or to grant sublicenses to third parties, under the Copyright covering the Contribution to use the Contribution by all means, including, but not limited to:

- to publish the Contribution,
- to modify the Contribution, to prepare derivative works based upon or containing the Contribution and to combine the Contribution with other software code,
- to reproduce the Contribution in original or modified form,
- to distribute, to make the Contribution available to the public, display and publicly perform the Contribution in original or modified form,
- to privately commercially license the Contribution to for-profit organizations.

  2.2 Moral Rights remain unaffected to the extent they are recognized and not waivable by applicable law. Notwithstanding, You may add your name in the header of the source code files of Your Contribution and We will respect this attribution when using Your Contribution.

3. PATENTS

3.1 Patent License

Subject to the terms and conditions of this Agreement You hereby grant to us a worldwide, royalty-free, non-exclusive, perpetual and irrevocable (except as stated in Section 3.2) patent license, with the right to transfer an unlimited number of non-exclusive licenses or to grant sublicenses to third parties, to make, have made, use, sell, offer for sale, import and otherwise transfer the Contribution and the Contribution in combination with the Material (and portions of such combination). This license applies to all patents owned or controlled by You, whether already acquired or hereafter acquired, that would be infringed by making, having made, using, selling, offering for sale, importing or otherwise transferring of Your Contribution(s) alone or by combination of Your Contribution(s) with the Material.

3.2 Revocation of Patent License

You reserve the right to revoke the patent license stated in section 3.1 if we make any infringement claim that is targeted at your Contribution and not asserted for a Defensive Purpose. An assertion of claims of the Patents shall be considered for a "Defensive Purpose" if the claims are asserted against an entity that has filed, maintained, threatened, or voluntarily participated in a patent infringement lawsuit against Us or any of Our licensees.

4. License Obligations by US

We agree to license the Contribution only under the terms of any licenses on the Free Software Foundation's list of "Recommended copyleft licenses" or approved by the Open Source Initiative.

In addition, We may use the following licenses for Documentation in the Contribution: CC BY-SA (including any right to adopt any future version of a license).

We agree to license patents owned or controlled by you only to the extent necessary to (sub)license Your Contribution(s) and the combination of Your Contribution(s) with the Material under the terms of any licenses on the Free Software Foundation's list of "Recommended copyleft licenses" or approved by the Open Source Initiative.

All of the above License Obligations may be waived and replaced by a private commercial license to **for-profit** organizations only. The monetary gain received shall always go to supporting the development and maintenance of this repository or other software systems maintained by the current repository maintainer(s). Non for-profit users shall always have open source licenses available under the terms of any licenses on the Free Software Foundation's list of "Recommended copyleft licenses" or approved by the Open Source Initiative.

5. DISCLAIMER

THE CONTRIBUTION IS PROVIDED "AS IS". MORE PARTICULARLY, ALL EXPRESS OR IMPLIED WARRANTIES INCLUDING, WITHOUT LIMITATION, ANY IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT ARE EXPRESSLY DISCLAIMED BY YOU TO US AND BY US TO YOU. TO THE EXTENT THAT ANY SUCH WARRANTIES CANNOT BE DISCLAIMED, SUCH WARRANTY IS LIMITED IN DURATION TO THE MINIMUM PERIOD PERMITTED BY LAW.

6. Consequential Damage Waiver

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL YOU OR US BE LIABLE FOR ANY LOSS OF PROFITS, LOSS OF ANTICIPATED SAVINGS, LOSS OF DATA, INDIRECT, SPECIAL, INCIDENTAL, CONSEQUENTIAL AND EXEMPLARY DAMAGES ARISING OUT OF THIS AGREEMENT REGARDLESS OF THE LEGAL OR EQUITABLE THEORY (CONTRACT, TORT OR OTHERWISE) UPON WHICH THE CLAIM IS BASED.

7. Approximation of Disclaimer and Damage Waiver

IF THE DISCLAIMER AND DAMAGE WAIVER MENTIONED IN SECTION 5 AND SECTION 6 CANNOT BE GIVEN LEGAL EFFECT UNDER APPLICABLE LOCAL LAW, REVIEWING COURTS SHALL APPLY LOCAL LAW THAT MOST CLOSELY APPROXIMATES AN ABSOLUTE WAIVER OF ALL CIVIL LIABILITY IN CONNECTION WITH THE CONTRIBUTION.

8. Term

8.1 This Agreement shall come into effect upon Your acceptance of the terms and conditions.

8.2 You shall have the right to terminate the Agreement in written form if We do not fulfill the obligations as set forth in Section 4.

8.3 In the event of a termination of this Agreement Sections 5, 6, 7, 8 and 9 shall survive such termination and shall remain in full force thereafter. For the avoidance of doubt, Contributions that are already licensed under a free and open source license at the date of the termination shall remain in full force after the termination of this Agreement.

9. Miscellaneous

9.1 This Agreement and all disputes, claims, actions, suits or other proceedings arising out of this agreement or relating in any way to it shall be governed by the laws of the United States excluding its private international law provisions.

9.2 This Agreement sets out the entire agreement between You and Us for Your Contributions to Us and overrides all other agreements or understandings.

9.3 If any provision of this Agreement is found void and unenforceable, such provision will be replaced to the extent possible with a provision that comes closest to the meaning of the original provision and that is enforceable. The terms and conditions set forth in this Agreement shall apply notwithstanding any failure of essential purpose of this Agreement or any limited remedy to the maximum extent possible under law.

9.4 You agree to notify Us of any facts or circumstances of which you become aware that would make this Agreement inaccurate in any respect.
