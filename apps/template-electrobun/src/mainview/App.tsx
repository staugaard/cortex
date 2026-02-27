import { useState } from "react";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Separator,
} from "@cortex/core-ui";
import { Minus, Plus, RotateCcw } from "lucide-react";

export default function App() {
	const [count, setCount] = useState(0);

	return (
		<div className="flex h-full items-center justify-center bg-background p-8">
			<Card className="w-[320px] shadow-sm">
				<CardHeader className="pb-4">
					<CardTitle className="text-base font-medium">Counter</CardTitle>
					<CardDescription>A simple counter built with core-ui</CardDescription>
				</CardHeader>
				<Separator />
				<CardContent className="pt-6">
					<div className="flex flex-col items-center gap-6">
						<Badge
							variant={count === 0 ? "secondary" : "default"}
							className="tabular-nums text-lg px-4 py-1"
						>
							{count}
						</Badge>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="icon"
								onClick={() => setCount((c) => c - 1)}
							>
								<Minus className="h-4 w-4" />
							</Button>
							<Button onClick={() => setCount((c) => c + 1)}>
								<Plus className="h-4 w-4" />
								Increment
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setCount(0)}
								disabled={count === 0}
							>
								<RotateCcw className="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
