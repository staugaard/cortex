import { Badge } from "@cortex/core-ui";
import { Bed, Bath, Car, PawPrint } from "lucide-react";
import type { RentalListing } from "./use-feed-state";

export type RentalListingFieldsProps = {
	listing: RentalListing;
};

export function RentalListingFields({ listing }: RentalListingFieldsProps) {
	return (
		<div className="flex flex-col gap-1">
			{/* Price + suburb */}
			<div className="flex items-baseline gap-1.5">
				<span className="text-sm font-semibold">
					${listing.weeklyRent}/wk
				</span>
				<span className="text-muted-foreground/50">&middot;</span>
				<span className="text-xs text-muted-foreground">
					{listing.suburb}
				</span>
			</div>

			{/* Property details strip */}
			<div className="flex flex-wrap items-center gap-3">
				<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
					<Bed className="size-3" />
					{listing.bedrooms}
				</span>
				<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
					<Bath className="size-3" />
					{listing.bathrooms}
				</span>
				{listing.parkingSpaces != null && (
					<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
						<Car className="size-3" />
						{listing.parkingSpaces}
					</span>
				)}
				{listing.petFriendly === true && (
					<span className="inline-flex items-center gap-1 text-xs text-emerald-600">
						<PawPrint className="size-3" />
						Pets OK
					</span>
				)}
				<Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
					{listing.propertyType}
				</Badge>
			</div>

			{/* Personalized summary */}
			{listing.personalizedSummary && (
				<p className="mt-1.5 text-xs text-foreground/80 border-t border-dashed pt-1.5">
					{listing.personalizedSummary}
				</p>
			)}

			{/* Commute + neighbourhood details */}
			{(listing.commuteEstimate || listing.neighbourhoodDescription) && (
				<div className="space-y-0.5">
					{listing.commuteEstimate && (
						<p className="text-[11px] text-muted-foreground">
							<span className="font-medium">Commute:</span> {listing.commuteEstimate}
						</p>
					)}
					{listing.neighbourhoodDescription && (
						<p className="text-[11px] text-muted-foreground">
							<span className="font-medium">Area:</span> {listing.neighbourhoodDescription}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
