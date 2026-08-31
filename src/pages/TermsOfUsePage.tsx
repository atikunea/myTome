import { Link as RouterLink } from "react-router-dom";
import { Link } from "@mui/material";
import {
  PolicyBullets,
  PolicyPage,
  PolicyParagraph,
  PolicySection,
} from "../components/PolicyProse";

/**
 * Terms of use — "use", not "service", because there is no service. No server,
 * no accounts, nothing operated on anyone's behalf, so the usual terms-of-
 * service machinery (termination, suspension, acceptable use, uptime) has
 * nothing to attach to: you cannot close an account that does not exist, or
 * stop someone running a bundle their browser already has.
 *
 * What is left is the half a licence file does not cover — disclaiming warranty
 * on something people trust manuscripts to, and saying the data-loss risk out
 * loud before it bites anyone. Clause 8 is written to be true while the repo
 * carries no LICENSE; adding one means editing that clause in the same commit,
 * not later.
 */
export function TermsOfUsePage() {
  return (
    <PolicyPage
      title="Terms of use"
      lede="What you can expect from myTome, and what it does not promise. These terms cover your use of this site."
      updated="30 August 2026"
      sibling={{ to: "/privacy", label: "Privacy" }}
    >
      <PolicySection title="The short version">
        <PolicyParagraph>
          myTome is free, runs entirely in your browser, and is offered as-is.
          Your writing is yours and never reaches me. Keep your own backups — if
          your browser loses the data, it is gone, and I cannot get it back.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="1. What myTome is">
        <PolicyParagraph>
          myTome is a writing workspace that runs entirely inside your web
          browser. There is no account to create, nothing to pay, and no server
          storing your work. Using it means accepting these terms; if you do not
          accept them, do not use it.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="2. Permission to use it">
        <PolicyParagraph>
          You may use this site for anything you like, personal or commercial,
          for as long as it is available. Nothing here obliges me to keep it
          running, keep it working, or keep it the same.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="3. Your work belongs to you">
        <PolicyParagraph>
          Everything you write in myTome is yours. I claim no ownership, no
          licence, and no right to use it — and I could not, since it never
          leaves your browser. The{" "}
          <Link component={RouterLink} to="/privacy">
            Privacy page
          </Link>{" "}
          sets out exactly what is
          stored and where.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="4. Your work can be lost, and backups are your job">
        <PolicyParagraph>
          This is the most important term on the page. Your writing is kept in
          this browser's storage, which is not permanent. It can be erased by
          clearing your browsing data, by a private or incognito window closing,
          by your browser reclaiming space, by some privacy settings after a
          stretch without visiting, or by an ordinary bug. When that happens the
          work is unrecoverable — there is no copy on a server, no trash, and
          nothing I can restore for you.
        </PolicyParagraph>
        <PolicyParagraph>
          myTome asks your browser to keep its storage durably, which helps, but
          it is a request and not a guarantee — and nothing stops you or your
          browser clearing the data anyway. Download backups regularly and keep
          them somewhere you trust. myTome gives you the tools; using them is up
          to you.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="5. No warranty">
        <PolicyParagraph>
          myTome is provided "as is" and "as available", without warranties of
          any kind, express or implied, including fitness for a particular
          purpose and non-infringement. I do not promise it is free of defects,
          that it will keep working, that it will stay online, or that it will
          be compatible with your browser or with a future version of itself. It
          is a personal project offered in good faith, not a product with
          support behind it.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="6. Limitation of liability">
        <PolicyParagraph>
          To the fullest extent the law allows, I am not liable for any loss or
          damage arising from your use of myTome — including lost, corrupted, or
          unrecoverable writing, lost time, or lost income. If some liability
          cannot be excluded where you live, it is limited to the amount you
          paid to use myTome, which is nothing.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="7. Google Drive sync">
        <PolicyParagraph>
          Drive sync is optional, off by default, and something you switch on
          yourself. If you use it:
        </PolicyParagraph>
        <PolicyBullets
          items={[
            "Your Google account and everything you put in it are governed by Google's terms and privacy policy, not mine.",
            "Sync writes backup files to your Drive and merges what it finds. It never deletes, so a tome you delete here comes back on the next sync until you delete the file in Drive yourself.",
            "Sync may stop working at any time, including for reasons entirely outside my control, and on this site it may be unavailable to you depending on how the Google project behind it is configured.",
          ]}
        />
      </PolicySection>

      <PolicySection title="8. The source code, and the name">
        <PolicyParagraph>
          The myTome source is published at{" "}
          <Link href="https://github.com/atikunea/myTome" target="_blank" rel="noreferrer">
            github.com/atikunea/myTome
          </Link>
          . Reading it does not grant rights to reuse it: no licence has been
          published yet, so these terms cover your use of this site and nothing
          more.
        </PolicyParagraph>
        <PolicyParagraph>
          The name "myTome" and the project's branding are not yours to use.
          Fork the code once it carries a licence; do not ship your fork under
          my name.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="9. Changes">
        <PolicyParagraph>
          I may change myTome or these terms at any time. The date at the top
          changes when the terms do. Continuing to use the site after that means
          accepting the new version — there is no notification mechanism, so
          this page is the record.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="10. Governing law">
        <PolicyParagraph>
          These terms are governed by the laws of the State of Texas, United
          States, without regard to conflict-of-laws rules.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="Questions">
        <PolicyParagraph>
          myTome is an open source project, and questions are welcome at{" "}
          <Link href="https://github.com/atikunea/myTome" target="_blank" rel="noreferrer">
            github.com/atikunea/myTome
          </Link>
          .
        </PolicyParagraph>
      </PolicySection>
    </PolicyPage>
  );
}
