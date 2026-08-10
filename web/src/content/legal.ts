import type { MarketCode } from "@/lib/market";

/**
 * Legal pages, carried over from the legacy site.
 *
 * The text is the business's own and is reproduced verbatim — it is not ours
 * to reword. Two things were removed rather than copied:
 *
 * - the contact card at the foot of each page, which linked to
 *   `wa.me/2348012345678` (a number the business does not own) and stated
 *   opening hours that contradict the ones on file. The route renders that
 *   card from the location record instead.
 * - nothing else. Anything below that needs a lawyer's eye is listed in
 *   LEGAL_REVIEW rather than silently edited.
 */

export interface LegalPage {
  slug: string;
  title: string;
  subtitle: string;
  body: string;
}

/**
 * When the text itself was last changed. Shown on the page, so it must track
 * real edits to the wording — not the date of a deploy.
 */
export const LEGAL_LAST_UPDATED = "2024-01-01";

export const LEGAL_PAGES: Record<string, LegalPage> = {
  "privacy-policy": {
    slug: "privacy-policy",
    title: "Privacy <span>Policy</span>",
    subtitle: "How we collect, use, and protect your personal information",
    body: `<!-- Table of Contents -->
        <div class="toc">
            <h3><i class="fas fa-list"></i> Table of Contents</h3>
            <ul class="toc-list">
                <li><a href="#information-we-collect"><i class="fas fa-chevron-right"></i> Information We Collect</a></li>
                <li><a href="#how-we-use"><i class="fas fa-chevron-right"></i> How We Use Your Information</a></li>
                <li><a href="#information-sharing"><i class="fas fa-chevron-right"></i> Information Sharing</a></li>
                <li><a href="#data-security"><i class="fas fa-chevron-right"></i> Data Security</a></li>
                <li><a href="#cookies"><i class="fas fa-chevron-right"></i> Cookies & Tracking</a></li>
                <li><a href="#your-rights"><i class="fas fa-chevron-right"></i> Your Rights</a></li>
                <li><a href="#third-party"><i class="fas fa-chevron-right"></i> Third-Party Links</a></li>
                <li><a href="#children"><i class="fas fa-chevron-right"></i> Children's Privacy</a></li>
                <li><a href="#changes"><i class="fas fa-chevron-right"></i> Policy Changes</a></li>
                <li><a href="#contact-us"><i class="fas fa-chevron-right"></i> Contact Us</a></li>
            </ul>
        </div>
        <div class="info-box">
            <p>At <strong>Adedayo Aremu Autos</strong>, your privacy is a priority. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or engage our services. Please read this policy carefully. By using our services, you agree to the practices described herein.</p>
        </div>
        <!-- Section 1 -->
        <div class="policy-section" id="information-we-collect">
            <h2><i class="fas fa-database"></i> 1. Information We Collect</h2>
            <h3>Personal Information You Provide</h3>
            <p>When you interact with us — whether to purchase a vehicle, apply for financing, rent a car, or make an inquiry — we may collect the following personal information:</p>
            <ul>
                <li>Full name, email address, phone number, and home/business address</li>
                <li>Government-issued identification (e.g., NIN, driver's licence, international passport)</li>
                <li>Financial information including bank account details, employment information, and income verification for financing applications</li>
                <li>Vehicle preferences, purchase history, and transaction records</li>
                <li>Messages and communications you send to us via contact forms, email, or WhatsApp</li>
            </ul>
            <h3>Information Collected Automatically</h3>
            <p>When you visit our website, certain information is automatically collected through your browser and device:</p>
            <ul>
                <li>IP address, browser type and version, operating system, and device type</li>
                <li>Pages visited, time spent on pages, links clicked, and referral URLs</li>
                <li>Geographic location data (country and city level, based on IP address)</li>
                <li>Cookie data and web analytics data as described in our Cookies section</li>
            </ul>
        </div>
        <!-- Section 2 -->
        <div class="policy-section" id="how-we-use">
            <h2><i class="fas fa-cogs"></i> 2. How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ol>
                <li><strong style="color: var(--silver-classic);">Service Delivery:</strong> To process vehicle purchases, rentals, and financing applications, and to complete transactions you initiate with us.</li>
                <li><strong style="color: var(--silver-classic);">Communication:</strong> To respond to your inquiries, send order confirmations, and provide updates about your transactions via phone, email, or WhatsApp.</li>
                <li><strong style="color: var(--silver-classic);">Identity Verification:</strong> To verify your identity and prevent fraud, particularly for financing and rental agreements.</li>
                <li><strong style="color: var(--silver-classic);">Marketing &amp; Promotions:</strong> With your consent, to send information about new vehicle listings, special offers, and promotions. You may opt out at any time.</li>
                <li><strong style="color: var(--silver-classic);">Website Improvement:</strong> To analyse usage patterns, improve our website functionality, and enhance the user experience.</li>
                <li><strong style="color: var(--silver-classic);">Legal Compliance:</strong> To comply with applicable Nigerian laws and regulations, including the Nigeria Data Protection Act (NDPA) 2023.</li>
            </ol>
        </div>
        <!-- Section 3 -->
        <div class="policy-section" id="information-sharing">
            <h2><i class="fas fa-share-alt"></i> 3. Information Sharing</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following limited circumstances:</p>
            <ul>
                <li><strong style="color: var(--silver-classic);">Financial Partners:</strong> With banks or financing institutions to process loan and instalment payment applications, strictly under confidentiality agreements.</li>
                <li><strong style="color: var(--silver-classic);">Legal Authorities:</strong> When required by law, court order, or regulation, or to protect the rights, property, or safety of Adedayo Aremu Autos, our customers, or others.</li>
                <li><strong style="color: var(--silver-classic);">Service Providers:</strong> With trusted third-party service providers (e.g., logistics, insurance) who assist in delivering our services, bound by strict data processing agreements.</li>
                <li><strong style="color: var(--silver-classic);">Referral Partners:</strong> With our referral partners only to the extent necessary to attribute and process a referral commission — no sensitive financial data is shared.</li>
            </ul>
            <div class="warning-box">
                <p><i class="fas fa-exclamation-triangle" style="color: var(--illustration-gold); margin-right: 8px;"></i> We will never sell your personal data to advertisers, data brokers, or any third party for commercial gain.</p>
            </div>
        </div>
        <!-- Section 4 -->
        <div class="policy-section" id="data-security">
            <h2><i class="fas fa-shield-alt"></i> 4. Data Security</h2>
            <p>We take the security of your personal information seriously. We implement appropriate technical and organisational measures to protect your data against unauthorised access, alteration, disclosure, or destruction. These measures include:</p>
            <ul>
                <li>Secure storage of physical and digital records with restricted access</li>
                <li>Use of encrypted communication channels for sensitive data transmission</li>
                <li>Regular review of our data collection, storage, and processing practices</li>
                <li>Staff training on data privacy and confidentiality obligations</li>
            </ul>
            <p>However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your personal information, we cannot guarantee its absolute security.</p>
        </div>
        <!-- Section 5 -->
        <div class="policy-section" id="cookies">
            <h2><i class="fas fa-cookie-bite"></i> 5. Cookies &amp; Tracking</h2>
            <p>Our website uses cookies and similar tracking technologies to enhance your browsing experience. Cookies are small files stored on your device that help us:</p>
            <ul>
                <li>Remember your currency preference and other settings between visits</li>
                <li>Understand how visitors use our website (pages visited, time spent, etc.)</li>
                <li>Improve website performance and load times</li>
                <li>Enable certain features such as the country detection notification</li>
            </ul>
            <p>You can control cookie settings through your browser preferences. Disabling cookies may affect the functionality of certain website features. We do not use cookies for targeted advertising purposes.</p>
        </div>
        <!-- Section 6 -->
        <div class="policy-section" id="your-rights">
            <h2><i class="fas fa-user-shield"></i> 6. Your Rights</h2>
            <p>Under the Nigeria Data Protection Act (NDPA) 2023 and applicable data protection regulations, you have the following rights regarding your personal data:</p>
            <ul>
                <li><strong style="color: var(--silver-classic);">Right to Access:</strong> Request a copy of the personal data we hold about you.</li>
                <li><strong style="color: var(--silver-classic);">Right to Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
                <li><strong style="color: var(--silver-classic);">Right to Erasure:</strong> Request deletion of your personal data where it is no longer necessary for the purpose it was collected.</li>
                <li><strong style="color: var(--silver-classic);">Right to Object:</strong> Object to processing of your data for marketing purposes at any time.</li>
                <li><strong style="color: var(--silver-classic);">Right to Data Portability:</strong> Request that we transfer your data to another service provider in a structured format.</li>
            </ul>
            <p>To exercise any of these rights, please contact us using the details in the Contact section below. We will respond to your request within 30 days.</p>
        </div>
        <!-- Section 7 -->
        <div class="policy-section" id="third-party">
            <h2><i class="fas fa-external-link-alt"></i> 7. Third-Party Links</h2>
            <p>Our website may contain links to third-party websites including social media platforms, financing partners, and automotive resources. These websites have their own privacy policies, and we do not accept any responsibility or liability for their policies or practices. We encourage you to review the privacy policy of any third-party site you visit.</p>
        </div>
        <!-- Section 8 -->
        <div class="policy-section" id="children">
            <h2><i class="fas fa-child"></i> 8. Children's Privacy</h2>
            <p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately and we will promptly delete such information from our records.</p>
        </div>
        <!-- Section 9 -->
        <div class="policy-section" id="changes">
            <h2><i class="fas fa-sync-alt"></i> 9. Changes to This Policy</h2>
            <p>We reserve the right to update or modify this Privacy Policy at any time. Any changes will be posted on this page with an updated "Last Updated" date. We encourage you to review this policy periodically to stay informed about how we are protecting your information. Continued use of our services after any changes constitutes your acceptance of the revised policy.</p>
        </div>
        <!-- Section 10 -->
        <div class="policy-section" id="contact-us">
            <h2><i class="fas fa-envelope"></i> 10. Contact Us</h2>
            <p>If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us through any of the following channels:</p>
        </div>
        <!-- Contact Card -->`,
  },

  "terms-of-service": {
    slug: "terms-of-service",
    title: "Terms of <span>Service</span>",
    subtitle: "The terms and conditions governing your use of our services",
    body: `<div class="toc">
            <h3><i class="fas fa-list"></i> Table of Contents</h3>
            <ul class="toc-list">
                <li><a href="#acceptance"><i class="fas fa-chevron-right"></i> Acceptance of Terms</a></li>
                <li><a href="#services"><i class="fas fa-chevron-right"></i> Our Services</a></li>
                <li><a href="#vehicle-sales"><i class="fas fa-chevron-right"></i> Vehicle Sales</a></li>
                <li><a href="#financing"><i class="fas fa-chevron-right"></i> Financing Terms</a></li>
                <li><a href="#referral"><i class="fas fa-chevron-right"></i> Referral Programme</a></li>
                <li><a href="#payments"><i class="fas fa-chevron-right"></i> Payments & Deposits</a></li>
                <li><a href="#liability"><i class="fas fa-chevron-right"></i> Limitation of Liability</a></li>
                <li><a href="#prohibited"><i class="fas fa-chevron-right"></i> Prohibited Conduct</a></li>
                <li><a href="#dispute"><i class="fas fa-chevron-right"></i> Dispute Resolution</a></li>
                <li><a href="#governing-law"><i class="fas fa-chevron-right"></i> Governing Law</a></li>
                <li><a href="#amendments"><i class="fas fa-chevron-right"></i> Amendments</a></li>
                <li><a href="#contact-us"><i class="fas fa-chevron-right"></i> Contact Us</a></li>
            </ul>
        </div>
        <div class="info-box">
            <p>Please read these Terms of Service carefully before engaging with <strong>Adedayo Aremu Autos</strong>. By purchasing, renting, or financing a vehicle through us, or by using our website, you agree to be bound by these terms. If you do not agree, please do not use our services.</p>
        </div>
        <!-- Section 1 -->
        <div class="policy-section" id="acceptance">
            <h2><i class="fas fa-file-signature"></i> 1. Acceptance of Terms</h2>
            <p>These Terms of Service ("Terms") constitute a legally binding agreement between you ("Customer" or "you") and Adedayo Aremu Autos ("we", "us", or "our"), governing your use of our website and all services we provide. By proceeding with any transaction, inquiry, or use of our website, you confirm that:</p>
            <ul>
                <li>You are at least 18 years of age and legally capable of entering into binding contracts under Nigerian law.</li>
                <li>You have read, understood, and agreed to these Terms in their entirety.</li>
                <li>All information you provide to us is accurate, current, and complete.</li>
            </ul>
        </div>
        <!-- Section 2 -->
        <div class="policy-section" id="services">
            <h2><i class="fas fa-concierge-bell"></i> 2. Our Services</h2>
            <p>Adedayo Aremu Autos provides the following automotive services:</p>
            <table class="terms-table">
                <thead>
                    <tr>
                        <th>Service</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong style="color: var(--silver-classic);">Vehicle Sales</strong></td>
                        <td>Purchase of new, foreign-used (Tokunbo), and Nigerian-used vehicles from our curated inventory.</td>
                    </tr>
                    <tr>
                        <td><strong style="color: var(--silver-classic);">Car Rental</strong></td>
                        <td>Short and long-term vehicle rental on daily, weekly, or monthly terms.</td>
                    </tr>
                    <tr>
                        <td><strong style="color: var(--silver-classic);">Vehicle Financing</strong></td>
                        <td>Flexible instalment payment plans for vehicle purchases, ranging from 6 to 24 months.</td>
                    </tr>
                    <tr>
                        <td><strong style="color: var(--silver-classic);">Referral Programme</strong></td>
                        <td>Commission-based referral system for partners who introduce verified buyers.</td>
                    </tr>
                </tbody>
            </table>
            <p>All services are subject to availability and our discretion. We reserve the right to decline any transaction at our reasonable judgment.</p>
        </div>
        <!-- Section 3 -->
        <div class="policy-section" id="vehicle-sales">
            <h2><i class="fas fa-car"></i> 3. Vehicle Sales</h2>
            <h3>Inspection & Condition</h3>
            <p>All vehicles listed for sale have undergone a pre-listing inspection. Vehicles are sold in their inspected condition at the time of sale. We strongly encourage all buyers to conduct their own independent inspection prior to completing a purchase.</p>
            <h3>Pricing</h3>
            <p>All prices displayed on our website and marketing materials are in Nigerian Naira (₦) unless otherwise stated. Prices are subject to change without prior notice until a purchase agreement is formally signed. Currency conversion rates shown are indicative only and may vary at the time of actual payment.</p>
            <h3>Transfer of Ownership</h3>
            <p>Legal ownership of a vehicle transfers to the buyer only upon receipt of full payment or execution of a signed financing agreement. We will assist with all documentation required for vehicle registration and transfer in Nigeria.</p>
            <h3>Vehicle Availability</h3>
            <p>Vehicle listings on our website represent our current inventory to the best of our knowledge. We do not guarantee availability and will notify you promptly if a selected vehicle has been sold. In such cases, any deposit paid will be fully refunded.</p>
            <div class="warning-box">
                <p><i class="fas fa-exclamation-triangle" style="color: var(--illustration-gold); margin-right: 8px;"></i> All sales are final once a purchase agreement is signed and payment received, except where a specific written warranty or return clause has been agreed upon.</p>
            </div>
        </div>
        <!-- Section 4 -->
        <div class="policy-section" id="financing">
            <h2><i class="fas fa-hand-holding-usd"></i> 4. Financing Terms</h2>
            <p>Our vehicle financing is subject to credit assessment and approval. By applying for financing, you authorise us to verify your financial information and share it with relevant financial partners. The following terms apply:</p>
            <ul>
                <li>A minimum down payment is required. The amount varies based on the vehicle price and your assessed creditworthiness.</li>
                <li>Instalment payment plans range from 6 to 24 months. Interest rates will be disclosed in your financing agreement before signing.</li>
                <li>Vehicles financed through our programme remain in our name or that of our financing partner until full repayment is completed.</li>
                <li>Missed or late instalments may result in penalties, repossession of the vehicle, and/or legal action as specified in the financing agreement.</li>
                <li>Early full repayment is permitted. Any applicable early repayment terms will be stated in your agreement.</li>
            </ul>
            <p>The specific terms of your financing — including total cost, interest rate, repayment schedule, and consequences of default — will be set out in a written financing agreement, which you must sign before any vehicle is released.</p>
        </div>
        <!-- Section 5 -->
        <div class="policy-section" id="referral">
            <h2><i class="fas fa-users"></i> 5. Referral Programme</h2>
            <p>Our referral programme allows individuals ("Referrers") to earn a commission by introducing verified buyers to our business. The following conditions apply:</p>
            <ul>
                <li>A commission of <strong style="color: var(--silver-classic);">1.5% of the final vehicle sale price</strong> is payable to the Referrer upon completion of a successful purchase by the referred party.</li>
                <li>A referral is deemed successful only when the full purchase price is paid and the transaction is finalised.</li>
                <li>Referrers must register their referral with us prior to the buyer making first contact to be eligible for commission.</li>
                <li>Commission payments are processed within 14 business days of transaction completion via the Referrer's registered bank account.</li>
                <li>Referrers may not misrepresent our services, apply undue pressure on potential buyers, or engage in deceptive practices. Breach of this condition forfeits the referral commission.</li>
                <li>We reserve the right to modify or terminate the referral programme at any time with reasonable notice.</li>
            </ul>
        </div>
        <!-- Section 6 -->
        <div class="policy-section" id="payments">
            <h2><i class="fas fa-money-bill-wave"></i> 6. Payments &amp; Deposits</h2>
            <h3>Accepted Payment Methods</h3>
            <p>We accept payment via bank transfer, USSD, and other electronic transfer methods. Cash payments may be accepted for amounts up to ₦5,000,000 in compliance with Central Bank of Nigeria (CBN) guidelines. Cryptocurrency and third-party payment apps are not accepted.</p>
            <h3>Deposits</h3>
            <p>A deposit is required to reserve a vehicle for a defined holding period. The deposit amount and holding period will be communicated to you in writing. Deposits are:</p>
            <ul>
                <li>Fully refundable if the vehicle is no longer available due to circumstances on our part.</li>
                <li>Non-refundable if you withdraw from the purchase without cause after the holding period begins, unless otherwise agreed in writing.</li>
                <li>Applied towards the full purchase price upon completion of the transaction.</li>
            </ul>
            <h3>Receipts</h3>
            <p>An official receipt will be issued for all payments. Please retain this receipt. We are not responsible for lost payments made to unofficial accounts. Always verify our official account details directly with us before making any transfer.</p>
            <div class="warning-box">
                <p><i class="fas fa-exclamation-triangle" style="color: var(--illustration-gold); margin-right: 8px;"></i> Beware of fraud. We will never ask you to transfer funds to a personal account. Always confirm payment details via our official WhatsApp or phone number.</p>
            </div>
        </div>
        <!-- Section 7 -->
        <div class="policy-section" id="liability">
            <h2><i class="fas fa-balance-scale"></i> 7. Limitation of Liability</h2>
            <p>To the maximum extent permitted by applicable law, Adedayo Aremu Autos shall not be liable for:</p>
            <ul>
                <li>Any indirect, incidental, consequential, or special loss or damage arising from your use of our services.</li>
                <li>Mechanical or technical faults in vehicles that arise after the transfer of ownership, except where covered by a written warranty.</li>
                <li>Losses arising from the actions of third parties including banks, insurance providers, or logistics partners.</li>
                <li>Inaccuracies in currency conversion rates displayed on our website.</li>
            </ul>
            <p>Our total liability to you in connection with any single transaction shall not exceed the amount you paid to us in that transaction. Nothing in these Terms limits our liability for fraud, personal injury caused by our negligence, or any other liability that cannot be excluded by law.</p>
        </div>
        <!-- Section 8 -->
        <div class="policy-section" id="prohibited">
            <h2><i class="fas fa-ban"></i> 8. Prohibited Conduct</h2>
            <p>When engaging with our services or website, you agree not to:</p>
            <ul>
                <li>Provide false, misleading, or fraudulent information in any application, form, or communication with us.</li>
                <li>Use our services for any unlawful purpose or in violation of applicable Nigerian law.</li>
                <li>Attempt to circumvent or manipulate our payment, financing, or referral systems.</li>
                <li>Harass, threaten, or engage in abusive conduct toward our staff or other customers.</li>
                <li>Reproduce, distribute, or commercially exploit our website content or vehicle listings without written permission.</li>
                <li>Impersonate our business or staff in any communications.</li>
            </ul>
            <p>Violation of any of the above may result in immediate termination of our services to you, forfeiture of any deposits paid, and potential legal action.</p>
        </div>
        <!-- Section 9 -->
        <div class="policy-section" id="dispute">
            <h2><i class="fas fa-handshake"></i> 9. Dispute Resolution</h2>
            <p>We are committed to resolving disputes amicably and promptly. In the event of a dispute:</p>
            <ol>
                <li><strong style="color: var(--silver-classic);">Direct Resolution:</strong> You must first contact us directly via phone, email, or WhatsApp. We will endeavour to resolve the matter within 14 business days.</li>
                <li><strong style="color: var(--silver-classic);">Mediation:</strong> If direct resolution is unsuccessful, either party may request mediation through a mutually agreed independent mediator in Lagos, Nigeria.</li>
                <li><strong style="color: var(--silver-classic);">Arbitration:</strong> If mediation fails, the dispute shall be referred to arbitration in accordance with the Arbitration and Conciliation Act (as amended) of Nigeria. The arbitration shall be conducted in Lagos.</li>
            </ol>
            <p>Nothing in this clause prevents either party from seeking urgent interim relief from a competent court.</p>
        </div>
        <!-- Section 10 -->
        <div class="policy-section" id="governing-law">
            <h2><i class="fas fa-gavel"></i> 10. Governing Law</h2>
            <p>These Terms of Service are governed by and construed in accordance with the laws of the Federal Republic of Nigeria. The courts of Lagos State, Nigeria, shall have exclusive jurisdiction to hear and determine any dispute arising out of or in connection with these Terms, subject to the dispute resolution clause above.</p>
        </div>
        <!-- Section 11 -->
        <div class="policy-section" id="amendments">
            <h2><i class="fas fa-edit"></i> 11. Amendments</h2>
            <p>We reserve the right to update these Terms of Service at any time. Updated Terms will be posted on our website with a revised "Last Updated" date. Your continued use of our services after any amendment constitutes acceptance of the new Terms. For significant changes, we will make reasonable efforts to notify existing customers via email or WhatsApp.</p>
        </div>
        <!-- Section 12 -->
        <div class="policy-section" id="contact-us">
            <h2><i class="fas fa-envelope"></i> 12. Contact Us</h2>
            <p>For questions about these Terms of Service or any aspect of our services, please contact us:</p>
        </div>`,
  },

  "rental-policy": {
    slug: "rental-policy",
    title: "Rental <span>Policy</span>",
    subtitle: "Everything you need to know before renting a vehicle from us",
    body: `<div class="toc">
            <h3><i class="fas fa-list"></i> Table of Contents</h3>
            <ul class="toc-list">
                <li><a href="#eligibility"><i class="fas fa-chevron-right"></i> Eligibility Requirements</a></li>
                <li><a href="#booking"><i class="fas fa-chevron-right"></i> Booking & Reservations</a></li>
                <li><a href="#rental-period"><i class="fas fa-chevron-right"></i> Rental Period</a></li>
                <li><a href="#rates"><i class="fas fa-chevron-right"></i> Rates & Payments</a></li>
                <li><a href="#deposit"><i class="fas fa-chevron-right"></i> Security Deposit</a></li>
                <li><a href="#vehicle-condition"><i class="fas fa-chevron-right"></i> Vehicle Condition</a></li>
                <li><a href="#usage"><i class="fas fa-chevron-right"></i> Permitted Use</a></li>
                <li><a href="#fuel"><i class="fas fa-chevron-right"></i> Fuel Policy</a></li>
                <li><a href="#insurance"><i class="fas fa-chevron-right"></i> Insurance & Liability</a></li>
                <li><a href="#accidents"><i class="fas fa-chevron-right"></i> Accidents & Damage</a></li>
                <li><a href="#cancellation"><i class="fas fa-chevron-right"></i> Cancellation & Refunds</a></li>
                <li><a href="#return"><i class="fas fa-chevron-right"></i> Vehicle Return</a></li>
            </ul>
        </div>
        <div class="info-box">
            <p>This Rental Policy applies to all vehicle rentals through <strong>Adedayo Aremu Autos</strong>. By completing a rental booking, you confirm that you have read, understood, and agreed to all the terms set out in this policy. Please read it carefully before proceeding.</p>
        </div>
        <!-- Section 1 -->
        <div class="policy-section" id="eligibility">
            <h2><i class="fas fa-id-card"></i> 1. Eligibility Requirements</h2>
            <p>To rent a vehicle from Adedayo Aremu Autos, all renters must meet the following requirements:</p>
            <div class="requirements-grid">
                <div class="requirement-card">
                    <i class="fas fa-birthday-cake"></i>
                    <h4>Minimum Age</h4>
                    <p>Must be at least 21 years of age at the time of rental.</p>
                </div>
                <div class="requirement-card">
                    <i class="fas fa-id-card"></i>
                    <h4>Valid ID</h4>
                    <p>Government-issued ID (NIN, International Passport, or Voter's Card).</p>
                </div>
                <div class="requirement-card">
                    <i class="fas fa-car"></i>
                    <h4>Driver's Licence</h4>
                    <p>A valid Nigerian driver's licence held for at least 2 years.</p>
                </div>
                <div class="requirement-card">
                    <i class="fas fa-phone-alt"></i>
                    <h4>Contact Details</h4>
                    <p>A valid phone number and verifiable home or office address.</p>
                </div>
            </div>
            <p>For renters aged 21–24, a Young Driver surcharge may apply as stated in your rental agreement. International renters must present a valid international driving permit alongside their foreign licence.</p>
        </div>
        <!-- Section 2 -->
        <div class="policy-section" id="booking">
            <h2><i class="fas fa-calendar-check"></i> 2. Booking &amp; Reservations</h2>
            <p>Reservations can be made via our website, WhatsApp, phone, or in person. A booking is only confirmed when:</p>
            <ul>
                <li>All required identification documents have been submitted and verified.</li>
                <li>The security deposit and rental payment have been received.</li>
                <li>A signed rental agreement has been executed between both parties.</li>
            </ul>
            <p>Vehicle availability is not guaranteed until a booking is formally confirmed. We recommend booking at least 48 hours in advance to secure your preferred vehicle. For long-term rentals (14 days or more), a minimum of 5 business days notice is required.</p>
        </div>
        <!-- Section 3 -->
        <div class="policy-section" id="rental-period">
            <h2><i class="fas fa-clock"></i> 3. Rental Period</h2>
            <p>Rental periods are structured as follows:</p>
            <ul>
                <li><strong style="color: var(--silver-classic);">Daily Rental:</strong> Minimum rental period is 1 day (24 hours). The rental clock begins at the time the vehicle is collected.</li>
                <li><strong style="color: var(--silver-classic);">Weekly Rental:</strong> 7 consecutive days from the collection time. Weekly rates offer a discount over daily pricing.</li>
                <li><strong style="color: var(--silver-classic);">Monthly Rental:</strong> 30 consecutive days. Monthly rates offer further discounts and are available on approved vehicles.</li>
            </ul>
            <p>The return time must match the collection time. A grace period of up to 1 hour is allowed. Returns more than 1 hour after the agreed time will attract an additional full-day rental charge at the daily rate.</p>
            <div class="warning-box">
                <p><i class="fas fa-exclamation-triangle" style="color: var(--illustration-gold); margin-right: 8px;"></i> Extensions to the rental period must be requested and approved before the original return time. Unauthorised extensions will be treated as a breach of the rental agreement.</p>
            </div>
        </div>
        <!-- Section 4 -->
        <div class="policy-section" id="rates">
            <h2><i class="fas fa-tags"></i> 4. Rates &amp; Payments</h2>
            <p>Rental rates vary by vehicle type, rental duration, and season. Current rates are available on our Rentals page or on request via WhatsApp. All rates are in Nigerian Naira (₦) and include:</p>
            <ul>
                <li>Basic third-party insurance cover</li>
                <li>Standard maintenance (oil, tyres, etc.) for long-term rentals</li>
                <li>Roadside assistance during business hours</li>
            </ul>
            <p>The following charges are <strong style="color: var(--silver-classic);">not included</strong> in the base rate and will be billed separately where applicable:</p>
            <table class="fees-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Charge</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Fuel (renter's responsibility)</td><td class="fee-amount">As used</td></tr>
                    <tr><td>Traffic fines &amp; toll charges</td><td class="fee-amount">Actual amount + ₦5,000 admin fee</td></tr>
                    <tr><td>Late return (beyond 1-hour grace)</td><td class="fee-amount">1 additional day rate</td></tr>
                    <tr><td>Young driver surcharge (age 21–24)</td><td class="fee-amount">₦5,000 per day</td></tr>
                    <tr><td>Out-of-Lagos travel permit</td><td class="fee-amount">₦15,000 per trip</td></tr>
                    <tr><td>Vehicle cleaning (excessively soiled)</td><td class="fee-amount">₦10,000 – ₦30,000</td></tr>
                    <tr><td>Lost key replacement</td><td class="fee-amount">Actual cost + ₦10,000</td></tr>
                </tbody>
            </table>
            <p>Full rental payment is due before vehicle collection. We accept bank transfer and electronic payment. Cash is accepted only for amounts up to ₦500,000.</p>
        </div>
        <!-- Section 5 -->
        <div class="policy-section" id="deposit">
            <h2><i class="fas fa-wallet"></i> 5. Security Deposit</h2>
            <p>A refundable security deposit is required for all rentals. The deposit amount is determined by the vehicle category:</p>
            <ul>
                <li><strong style="color: var(--silver-classic);">Economy/Saloon Cars:</strong> ₦50,000 – ₦100,000</li>
                <li><strong style="color: var(--silver-classic);">SUVs &amp; Crossovers:</strong> ₦150,000 – ₦250,000</li>
                <li><strong style="color: var(--silver-classic);">Luxury Vehicles:</strong> ₦300,000 – ₦500,000</li>
            </ul>
            <p>The security deposit will be refunded within <strong style="color: var(--silver-classic);">3–5 business days</strong> after the vehicle is returned in satisfactory condition, provided there are no outstanding charges, fines, or damage to the vehicle. We reserve the right to deduct any amounts owed from the deposit before refunding the balance.</p>
        </div>
        <!-- Section 6 -->
        <div class="policy-section" id="vehicle-condition">
            <h2><i class="fas fa-clipboard-check"></i> 6. Vehicle Condition</h2>
            <p>Before every rental, a thorough inspection of the vehicle is conducted jointly with the renter. Both parties will sign a Vehicle Condition Report (VCR) documenting any pre-existing damage, fuel level, and mileage. This report protects you from being held responsible for pre-existing damage.</p>
            <p>You are responsible for returning the vehicle in the same condition it was rented, fair wear and tear excepted. The vehicle must be returned:</p>
            <ul>
                <li>Clean on the exterior and interior (no excessive dirt, stains, or odours)</li>
                <li>Free from new damage not recorded on the original VCR</li>
                <li>With the same fuel level as at collection</li>
                <li>With all accessories, keys, and documents included at rental</li>
            </ul>
        </div>
        <!-- Section 7 -->
        <div class="policy-section" id="usage">
            <h2><i class="fas fa-road"></i> 7. Permitted Use</h2>
            <p>The rental vehicle may only be used for normal private or commercial transportation on paved or standard roads in Nigeria. The following uses are strictly prohibited:</p>
            <ul>
                <li>Sub-letting, re-renting, or allowing any unauthorised driver to operate the vehicle</li>
                <li>Use for commercial ridesharing services (e.g., Bolt, Uber) without prior written consent</li>
                <li>Off-road driving, racing, rallying, or any other motorsport activity</li>
                <li>Transporting hazardous, illegal, or contraband materials</li>
                <li>Travel outside the borders of Nigeria</li>
                <li>Travel outside Lagos State without prior written approval and payment of the out-of-Lagos permit fee</li>
                <li>Towing another vehicle or trailer</li>
                <li>Driving under the influence of alcohol, drugs, or any substance that impairs judgement</li>
            </ul>
            <div class="danger-box">
                <p><i class="fas fa-exclamation-circle" style="color: #c05050; margin-right: 8px;"></i> Breach of permitted use conditions immediately voids your insurance cover and renders you personally liable for all costs, damage, and legal consequences arising from such use.</p>
            </div>
        </div>
        <!-- Section 8 -->
        <div class="policy-section" id="fuel">
            <h2><i class="fas fa-gas-pump"></i> 8. Fuel Policy</h2>
            <p>All vehicles are provided with a full tank of fuel at collection. You are required to return the vehicle with a full tank. If the vehicle is returned with less fuel than at collection, a refuelling charge will be deducted from your security deposit. This charge includes the cost of fuel plus a ₦3,000 refuelling service fee.</p>
            <p>Please use the correct fuel type for the vehicle as indicated in the vehicle handbook. Using the wrong fuel type will result in damage charges being applied to you in full.</p>
        </div>
        <!-- Section 9 -->
        <div class="policy-section" id="insurance">
            <h2><i class="fas fa-shield-alt"></i> 9. Insurance &amp; Liability</h2>
            <p>All rental vehicles carry valid third-party motor insurance in compliance with Nigerian law. This covers third-party bodily injury and property damage arising from an accident. It does not cover:</p>
            <ul>
                <li>Damage to the rented vehicle itself (unless comprehensive insurance is selected at an additional cost)</li>
                <li>Theft of the vehicle or personal belongings left in the vehicle</li>
                <li>Damage caused by prohibited use as defined in Section 7</li>
                <li>Damage caused while driving under the influence of alcohol or substances</li>
                <li>Mechanical damage caused by misuse or neglect</li>
            </ul>
            <p>An optional Comprehensive Damage Waiver (CDW) can be added to your rental at an extra cost, significantly reducing your financial liability in the event of an accident. Ask us for details when booking.</p>
        </div>
        <!-- Section 10 -->
        <div class="policy-section" id="accidents">
            <h2><i class="fas fa-car-crash"></i> 10. Accidents &amp; Damage</h2>
            <p>In the event of an accident, theft, or damage to the vehicle, you must:</p>
            <ol>
                <li>Ensure the safety of all persons involved and render reasonable assistance.</li>
                <li>Contact the nearest police station and obtain an official police report immediately.</li>
                <li>Notify Adedayo Aremu Autos by phone or WhatsApp within <strong style="color: var(--silver-classic);">2 hours</strong> of the incident.</li>
                <li>Do not admit liability, make any payment, or sign any document related to the accident on our behalf.</li>
                <li>Provide us with the police report, details of all parties involved, and photographs of the scene and damage.</li>
            </ol>
            <p>Failure to report an incident promptly may void any insurance protection and result in you being held fully liable for all damage, recovery, and legal costs.</p>
            <div class="warning-box">
                <p><i class="fas fa-exclamation-triangle" style="color: var(--illustration-gold); margin-right: 8px;"></i> You are liable for all damage to the vehicle that is not covered by the applicable insurance policy, including the policy excess. Damage repair costs will be assessed by our designated workshop.</p>
            </div>
        </div>
        <!-- Section 11 -->
        <div class="policy-section" id="cancellation">
            <h2><i class="fas fa-times-circle"></i> 11. Cancellation &amp; Refunds</h2>
            <p>Our cancellation and refund policy is as follows:</p>
            <table class="fees-table">
                <thead>
                    <tr>
                        <th>Cancellation Notice Period</th>
                        <th>Refund</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>More than 72 hours before rental start</td><td class="fee-amount">Full refund of rental payment</td></tr>
                    <tr><td>24 – 72 hours before rental start</td><td class="fee-amount">50% refund of rental payment</td></tr>
                    <tr><td>Less than 24 hours before rental start</td><td class="fee-amount">No refund</td></tr>
                    <tr><td>No-show (renter fails to collect)</td><td class="fee-amount">No refund</td></tr>
                </tbody>
            </table>
            <p>The security deposit is always fully refunded upon cancellation, provided no services have been rendered. In the event we cancel your reservation due to circumstances on our part (vehicle unavailability, etc.), a full refund of all amounts paid will be issued within 3 business days.</p>
        </div>
        <!-- Section 12 -->
        <div class="policy-section" id="return">
            <h2><i class="fas fa-undo-alt"></i> 12. Vehicle Return</h2>
            <p>Vehicles must be returned to our designated location as agreed at the time of booking, unless an alternative drop-off has been pre-arranged in writing. The following applies to vehicle returns:</p>
            <ul>
                <li>Return must be made during our business hours (Monday – Saturday, 9:00 AM – 6:00 PM) unless a prior arrangement has been made for after-hours return.</li>
                <li>A joint return inspection will be conducted by our staff and the renter upon vehicle return.</li>
                <li>Any new damage found on return will be noted and assessed for cost, which will be deducted from the security deposit or invoiced separately if costs exceed the deposit.</li>
                <li>The renter must be present during the return inspection. If the renter is absent, our assessment of the vehicle condition shall be final.</li>
                <li>All personal belongings must be removed from the vehicle before return. We are not responsible for items left in returned vehicles.</li>
            </ul>
            <p>Upon successful return and clearance of all charges, your security deposit will be refunded within 3–5 business days to your registered bank account.</p>
        </div>`,
  },

};

export const LEGAL_SLUGS = Object.keys(LEGAL_PAGES);

/** Footer and cross-links, in the order the legacy footer listed them. */
export const legalNav = (market: MarketCode) =>
  LEGAL_SLUGS.map((s) => ({ href: `/${market}/${s}`, label: LEGAL_PAGES[s].title }));
