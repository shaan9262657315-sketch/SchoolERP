import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import App, { type PublicAnnouncement, type PublicGalleryItem, type PublicSchool } from "../App";
import { API_URL } from "../services/api";

interface PublicWebsiteResponse {
  school: PublicSchool;
  gallery: PublicGalleryItem[];
  notices: PublicAnnouncement[];
}

export default function SchoolWebsite() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicWebsiteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSchoolWebsite() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        if (!slug) throw new Error("School website not found.");

        const response = await fetch(
          `${API_URL}/public/schools/${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );

        if (response.status === 404) {
          throw new Error("This school website was not found.");
        }
        if (!response.ok) {
          throw new Error("Unable to load this school website. Please try again.");
        }

        const result = (await response.json()) as PublicWebsiteResponse;
        if (!result.school || !Array.isArray(result.gallery) || !Array.isArray(result.notices)) {
          throw new Error("The school website returned an invalid response.");
        }

        setData(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unable to load school website.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSchoolWebsite();
    return () => controller.abort();
  }, [slug]);

  if (loading) {
    return <main className="public-site-status" role="status">Loading school website...</main>;
  }

  if (error || !data) {
    return (
      <main className="public-site-status" role="alert">
        <h1>School website unavailable</h1>
        <p>{error || "This school website could not be loaded."}</p>
        <a href="/">Return to home</a>
      </main>
    );
  }

  return <App school={data.school} gallery={data.gallery} notices={data.notices} />;
}
