import { useState, useEffect, useCallback } from "react";
import {
	cn,
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselPrevious,
	CarouselNext,
} from "@cortex/core-ui";
import { Home } from "lucide-react";
import type { CarouselApi } from "@cortex/core-ui";

export type ListingImageCarouselProps = {
	images: string[];
	alt: string;
	aspectRatio?: "16/9" | "4/3" | "3/2";
	className?: string;
};

export function ListingImageCarousel({
	images,
	alt,
	aspectRatio = "3/2",
	className,
}: ListingImageCarouselProps) {
	const [api, setApi] = useState<CarouselApi>();
	const [current, setCurrent] = useState(0);
	const count = images.length;
	const hasMultiple = count > 1;

	const onSelect = useCallback(() => {
		if (!api) return;
		setCurrent(api.selectedScrollSnap());
	}, [api]);

	useEffect(() => {
		if (!api) return;
		onSelect();
		api.on("select", onSelect);
		return () => {
			api.off("select", onSelect);
		};
	}, [api, onSelect]);

	// No images — placeholder
	if (count === 0) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded-t-lg bg-muted",
					className,
				)}
				style={{ aspectRatio }}
			>
				<Home className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
			</div>
		);
	}

	// Single image — no controls
	if (!hasMultiple) {
		return (
			<div
				className={cn("overflow-hidden rounded-t-lg", className)}
				style={{ aspectRatio }}
			>
				<img
					src={images[0]}
					alt={alt}
					loading="lazy"
					className="size-full object-cover"
				/>
			</div>
		);
	}

	// Multi-image carousel
	return (
		<Carousel setApi={setApi} className={cn("group relative", className)}>
			<CarouselContent className="ml-0">
				{images.map((src, i) => (
					<CarouselItem key={src} className="pl-0">
						<div
							className="overflow-hidden rounded-t-lg"
							style={{ aspectRatio }}
						>
							<img
								src={src}
								alt={`${alt} ${i + 1}`}
								loading="lazy"
								className="size-full object-cover"
							/>
						</div>
					</CarouselItem>
				))}
			</CarouselContent>

			{/* Nav arrows — frosted glass, hover-only */}
			<CarouselPrevious
				variant="ghost"
				className="absolute top-1/2 left-2 -translate-y-1/2 size-7 rounded-full border-0 bg-black/40 text-white backdrop-blur-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/60 disabled:opacity-0"
			/>
			<CarouselNext
				variant="ghost"
				className="absolute top-1/2 right-2 -translate-y-1/2 size-7 rounded-full border-0 bg-black/40 text-white backdrop-blur-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/60 disabled:opacity-0"
			/>

			{/* Image counter badge — top right */}
			<span className="absolute top-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
				{current + 1} / {count}
			</span>

			{/* Dot indicators — bottom center */}
			<div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
				{images.map((_, i) => (
					<button
						key={i}
						type="button"
						aria-label={`Go to slide ${i + 1}`}
						className={cn(
							"size-1.5 rounded-full transition-colors duration-150",
							i === current ? "bg-white" : "bg-white/40",
						)}
						onClick={() => api?.scrollTo(i)}
					/>
				))}
			</div>
		</Carousel>
	);
}
