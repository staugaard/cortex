export function ErrorToasts({
	error,
	loadError,
	saveError,
	onDismissError,
	onDismissLoadError,
	onDismissSaveError,
}: {
	error: Error | undefined;
	loadError: string | null;
	saveError: string | null;
	onDismissError: () => void;
	onDismissLoadError: () => void;
	onDismissSaveError: () => void;
}) {
	if (!error && !loadError && !saveError) return null;

	return (
		<div className="absolute top-[46px] right-3 z-50 flex flex-col gap-1.5">
			{error && (
				<ErrorToast
					title="Chat Error"
					message={error.message}
					onDismiss={onDismissError}
					variant="error"
				/>
			)}
			{loadError && (
				<ErrorToast
					title="Load Error"
					message={loadError}
					onDismiss={onDismissLoadError}
					variant="warning"
				/>
			)}
			{saveError && (
				<ErrorToast
					title="Save Error"
					message={saveError}
					onDismiss={onDismissSaveError}
					variant="warning"
				/>
			)}
		</div>
	);
}

function ErrorToast({
	title,
	message,
	variant,
	onDismiss,
}: {
	title: string;
	message: string;
	variant: "error" | "warning";
	onDismiss?: () => void;
}) {
	const colors =
		variant === "error"
			? "border-destructive/20 bg-destructive/5 text-destructive"
			: "border-warning/20 bg-warning/5 text-warning";

	return (
		<div
			className={`toast-in max-w-[280px] rounded-lg border px-3 py-2 text-[12px] shadow-sm ${colors}`}
		>
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="font-medium">{title}</p>
					<p className="mt-0.5 opacity-80">{message}</p>
				</div>
				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="mt-0.5 shrink-0 opacity-50 transition-opacity hover:opacity-100"
					>
						<svg
							width="10"
							height="10"
							viewBox="0 0 10 10"
							fill="none"
						>
							<path
								d="M2 2l6 6M8 2l-6 6"
								stroke="currentColor"
								strokeWidth="1.3"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}
