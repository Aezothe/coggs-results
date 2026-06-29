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
      <SkeletonChart />
      <SkeletonTable rows={8} />
      <SkeletonSection titleWidth="w-40" />
    </SkeletonPage>
  );
}