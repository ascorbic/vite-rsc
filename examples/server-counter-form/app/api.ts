"use server";

import { redirect } from "rsc-router";
import db from "./db";

export async function increment() {
	let count = await getCount();
	await db.counter.update({
		where: { id: 1 },
		data: { value: count + 1 },
	});
	redirect("/" + (count + 1));
}

export async function getCount() {
	return (
		(
			await db.counter.findFirst({
				where: { id: 1 },
				select: { value: true },
			})
		)?.value ?? 0
	);
}
