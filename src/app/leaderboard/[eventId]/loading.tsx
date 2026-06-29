import {
  SkeletonPage,
  SkeletonSection,
  SkeletonChart,
  SkeletonTable,
} from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonSection titleWidth="w-32" />
      <SkeletonTable rows={15} />
    </SkeletonPage>
  );
}