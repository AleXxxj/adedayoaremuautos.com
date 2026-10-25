import type { LegalPage } from "./legal";

/**
 * The Rental Policy for Greensboro.
 *
 * The shared policy was written for Nigeria and was being shown on the US
 * site unchanged: NIN or a Voter's Card as ID, a Nigerian licence held two
 * years, fees in naira, a permit for leaving Lagos, a cash ceiling set by the
 * Central Bank of Nigeria, and deposits refunded "to your registered bank
 * account" — which this site has never collected. A Greensboro customer
 * reading it could not tell what applied to them.
 *
 * Built from three sources, in this order of authority:
 *
 *   1. The founder's own US rental agreement (src/content/rentalTerms.ts),
 *      which is the contract the customer actually accepts. This page says
 *      so, and defers to it where they differ.
 *   2. How the booking flow really works — the 2-day hold, the documents,
 *      the injury notice, paying online or at pickup.
 *   3. The business's existing policy for the parts that are not
 *      market-specific: the one-hour grace period, the cancellation
 *      schedule, the deposit release window.
 *
 * No dollar figure is invented. Where the Nigerian policy named a fixed fee,
 * this one charges the actual cost or the rate on the rental agreement, until
 * the business decides its own US numbers.
 *
 * Kept in step with RESERVATION_HOURS, MAX_OPEN_RESERVATIONS and the rental
 * terms by hand — if any of those change, this page has to change with them.
 */
export const RENTAL_POLICY_US: LegalPage = {
  slug: "rental-policy",
  title: "Rental <span>Policy</span>",
  subtitle: "How renting a vehicle from us in Greensboro works",
  body: `<div class="toc">
            <h3><i class="fas fa-list"></i> Table of Contents</h3>
            <ul class="toc-list">
                <li><a href="#eligibility"><i class="fas fa-chevron-right"></i> Who Can Rent</a></li>
                <li><a href="#booking"><i class="fas fa-chevron-right"></i> Reserving a Vehicle</a></li>
                <li><a href="#rental-period"><i class="fas fa-chevron-right"></i> Rental Period</a></li>
                <li><a href="#rates"><i class="fas fa-chevron-right"></i> Rates &amp; Payments</a></li>
                <li><a href="#deposit"><i class="fas fa-chevron-right"></i> Security Deposit</a></li>
                <li><a href="#vehicle-condition"><i class="fas fa-chevron-right"></i> Vehicle Condition</a></li>
                <li><a href="#usage"><i class="fas fa-chevron-right"></i> Permitted Use</a></li>
                <li><a href="#fuel"><i class="fas fa-chevron-right"></i> Fuel</a></li>
                <li><a href="#insurance"><i class="fas fa-chevron-right"></i> Insurance &amp; Injury</a></li>
                <li><a href="#accidents"><i class="fas fa-chevron-right"></i> Accidents &amp; Damage</a></li>
                <li><a href="#cancellation"><i class="fas fa-chevron-right"></i> Cancellations &amp; Refunds</a></li>
                <li><a href="#return"><i class="fas fa-chevron-right"></i> Returning the Vehicle</a></li>
                <li><a href="#law"><i class="fas fa-chevron-right"></i> Governing Law</a></li>
            </ul>
        </div>
        <div class="info-box">
            <p>This policy explains how renting a vehicle from <strong>Adedayo Aremu Autos</strong> in Greensboro, North Carolina works. When you reserve, you accept our rental terms, and you sign a rental agreement at pickup. If anything on this page differs from your signed rental agreement, the agreement controls.</p>
        </div>

        <!-- Section 1 -->
        <div class="policy-section" id="eligibility">
            <h2><i class="fas fa-id-card"></i> 1. Who Can Rent</h2>
            <p>To rent a vehicle from us, you must meet all of the following requirements:</p>
            <div class="requirements-grid">
                <div class="requirement-card">
                    <i class="fas fa-birthday-cake"></i>
                    <h4>Age</h4>
                    <p>You must be 18 or older on the day you pick up the vehicle.</p>
                </div>
                <div class="requirement-card">
                    <i class="fas fa-id-card"></i>
                    <h4>Driver's License</h4>
                    <p>A valid US driver's license, in your name, that does not expire before the end of your rental.</p>
                </div>
                <div class="requirement-card">
                    <i class="fas fa-globe"></i>
                    <h4>International Renters</h4>
                    <p>A valid license from your home country together with an International Driving Permit, plus your passport.</p>
                </div>
                <div class="requirement-card">
                    <i class="fas fa-phone-alt"></i>
                    <h4>Contact Details</h4>
                    <p>A phone number we can reach you on during your rental. An email address lets us send your reservation link.</p>
                </div>
            </div>
            <p>You upload a photo of your driver's license when you reserve. If you will be using your own insurance, you upload proof of insurance too. Our team reviews your documents before the vehicle is released, and the name on them must match the person picking up the vehicle.</p>
        </div>

        <!-- Section 2 -->
        <div class="policy-section" id="booking">
            <h2><i class="fas fa-calendar-check"></i> 2. Reserving a Vehicle</h2>
            <p>You can reserve on our website, by phone, or in person.</p>
            <p><strong style="color: var(--silver-classic);">Your vehicle is held for you.</strong> When you reserve online, we hold the vehicle for up to 2 days so you can come and see it before you pay. The hold always ends by your pickup time. While it lasts, nobody else can book those dates. You can pay online at any point during the hold, using the link we email you, or on our website right away.</p>
            <p>If the hold ends and the rental has not been paid for, the dates become available to other customers again. You can hold up to two vehicles at a time. If you need more time, call us — we can usually extend a hold.</p>
            <p>Before we hand over the keys, all of the following must be in place:</p>
            <ul>
                <li>Our team has reviewed your driver's license, and your proof of insurance if you are using your own.</li>
                <li>The rental charge has been paid, online or at pickup.</li>
                <li>The refundable security deposit has been taken.</li>
                <li>You have signed the rental agreement.</li>
            </ul>
        </div>

        <!-- Section 3 -->
        <div class="policy-section" id="rental-period">
            <h2><i class="fas fa-clock"></i> 3. Rental Period</h2>
            <ul>
                <li><strong style="color: var(--silver-classic);">Daily:</strong> each day is 24 hours, counted from your pickup time.</li>
                <li><strong style="color: var(--silver-classic);">Weekly:</strong> 7 days in a row from your pickup time.</li>
                <li><strong style="color: var(--silver-classic);">Monthly:</strong> 30 days in a row, on vehicles that offer a monthly rate.</li>
            </ul>
            <p>We price your rental on the cheapest combination of these rates automatically, so you never pay more than the daily rate times the number of days. The minimum rental for each vehicle is shown on its page.</p>
            <p>Please return the vehicle by the same time of day you picked it up. We allow a 1-hour grace period. After that, an extra day is charged at the daily rate.</p>
            <p>If you want to keep the vehicle longer, contact us before your original return time. An extension is only valid once we have approved it.</p>
        </div>

        <!-- Section 4 -->
        <div class="policy-section" id="rates">
            <h2><i class="fas fa-dollar-sign"></i> 4. Rates &amp; Payments</h2>
            <p>Current rates for every vehicle are on our Rentals page, in US dollars. Your rate includes the vehicle's insurance (see Section 9) and the mileage allowance stated on your rental agreement.</p>
            <p>The following are not included in your rate and are charged only when they apply:</p>
            <table class="fees-table">
                <thead>
                    <tr><th>Item</th><th>Charge</th></tr>
                </thead>
                <tbody>
                    <tr><td>Fuel</td><td class="fee-amount">The cost of refilling to the level at pickup</td></tr>
                    <tr><td>Tolls, parking, and traffic or parking tickets</td><td class="fee-amount">The actual amount</td></tr>
                    <tr><td>Miles over your allowance</td><td class="fee-amount">The rate stated on your rental agreement</td></tr>
                    <tr><td>Late return (more than 1 hour late)</td><td class="fee-amount">One extra day at the daily rate</td></tr>
                    <tr><td>Cleaning, if returned excessively dirty</td><td class="fee-amount">The actual cost of cleaning</td></tr>
                    <tr><td>Lost or damaged keys</td><td class="fee-amount">The actual replacement cost</td></tr>
                    <tr><td>Towing or impound caused by your use</td><td class="fee-amount">The actual amount</td></tr>
                    <tr><td>Added insurance coverage, if you choose it</td><td class="fee-amount">Shown before you book (see Section 9)</td></tr>
                </tbody>
            </table>
            <p>You can pay the rental charge by card online when you reserve, or at pickup. Online card payments are handled by our payment provider, and your card details never reach our website. We will never ask for your bank account details or Social Security number, on this site or by email.</p>
        </div>

        <!-- Section 5 -->
        <div class="policy-section" id="deposit">
            <h2><i class="fas fa-shield-alt"></i> 5. Security Deposit</h2>
            <p>Every rental requires a refundable security deposit. The amount for each vehicle is shown on its page and on your reservation, and it is taken at pickup — not when you reserve.</p>
            <p>The deposit may be used to cover unpaid rental charges, cleaning, fuel, tolls, tickets, damage, or other amounts you are responsible for under your rental agreement. Anything not used is released within 3–5 business days after you return the vehicle, back to the payment method you used. Your bank may take a few extra days to show it.</p>
        </div>

        <!-- Section 6 -->
        <div class="policy-section" id="vehicle-condition">
            <h2><i class="fas fa-car"></i> 6. Vehicle Condition</h2>
            <p>At pickup, we inspect the vehicle with you and take photos. Any existing damage, the fuel level, and the mileage are recorded. Please check the record before you sign it — it is what we compare against when you return.</p>
            <p>Return the vehicle in the same condition you received it, apart from normal wear and tear:</p>
            <ul>
                <li>Reasonably clean inside and out</li>
                <li>With no new damage beyond what was recorded at pickup</li>
                <li>With the same fuel level as at pickup</li>
                <li>With all keys, documents, and accessories</li>
            </ul>
            <p>If a warning light comes on, you notice a mechanical problem, or the vehicle feels unsafe, tell us right away. Do not arrange major repairs without our approval, except in an immediate safety emergency.</p>
        </div>

        <!-- Section 7 -->
        <div class="policy-section" id="usage">
            <h2><i class="fas fa-road"></i> 7. Permitted Use</h2>
            <p>The vehicle may only be used for lawful purposes and for the use stated on your rental agreement. Only you, and any additional driver we have approved in writing, may drive it.</p>
            <p><strong style="color: var(--silver-classic);">Delivery and rideshare work</strong> (for example DoorDash, Uber, or Lyft) is allowed only when it is the authorized use on your rental agreement. You are then responsible for the insurance, platform approvals, and permits that work requires. Many personal auto policies do not cover delivery, rideshare, or business use — check yours before you drive. We make no promise about how much you will earn.</p>
            <p>The following are not allowed:</p>
            <ul>
                <li>Lending, sub-renting, or handing the vehicle to anyone not approved by us</li>
                <li>Racing, off-road driving, or towing</li>
                <li>Carrying anything illegal or hazardous</li>
                <li>Driving under the influence of alcohol, drugs, or anything that impairs your driving</li>
                <li>Any illegal activity</li>
            </ul>
            <div class="danger-box">
                <p>If the vehicle is used in a way that is not allowed, you may be personally responsible for all damage, costs, and legal consequences that result — whatever insurance applies.</p>
            </div>
        </div>

        <!-- Section 8 -->
        <div class="policy-section" id="fuel">
            <h2><i class="fas fa-gas-pump"></i> 8. Fuel</h2>
            <p>Return the vehicle with the same fuel level it had at pickup, which is recorded on your condition report. If it comes back with less, we charge the cost of refilling it. Please use the fuel type shown for the vehicle — the cost of repairing damage from the wrong fuel is charged to you in full.</p>
        </div>

        <!-- Section 9 -->
        <div class="policy-section" id="insurance">
            <h2><i class="fas fa-file-shield"></i> 9. Insurance &amp; Injury</h2>
            <div class="warning-box">
                <p><strong>The vehicle is insured. You are not.</strong> Our insurance covers the vehicle if it is involved in an accident. It does not cover bodily injury to you, the renter, or to your passengers. If you are injured while driving or riding in one of our vehicles, our insurance will not pay your medical bills.</p>
            </div>
            <p>When you reserve, you choose one of these options:</p>
            <ul>
                <li><strong style="color: var(--silver-classic);">Your own insurance.</strong> You upload proof of insurance, and we review it before the vehicle is released. Make sure your policy covers you to drive this vehicle for the way you plan to use it.</li>
                <li><strong style="color: var(--silver-classic);">Added coverage through our insurer</strong>, where we offer it. Adedayo Aremu Autos is not an insurance company and does not sell insurance. Instead, we can arrange with our licensed insurance company for you to be added as a driver on our policy for your rental period. The extra cost is set by the insurer, shown before you book, and listed on your receipt. What the coverage includes is set by the insurer's policy, and we will explain it before you choose it.</li>
                <li><strong style="color: var(--silver-classic);">No insurance.</strong> You can still rent. By choosing this, you confirm you understand that our insurance does not cover your own injuries and that you are responsible for your own medical bills. We record when you made this choice.</li>
            </ul>
            <p>Whichever you choose, you remain responsible for loss or damage caused by negligence, misuse, an unauthorized driver, use that is not allowed, or a breach of your rental agreement, subject to applicable law and insurance. Personal belongings left in the vehicle are not covered by our insurance.</p>
        </div>

        <!-- Section 10 -->
        <div class="policy-section" id="accidents">
            <h2><i class="fas fa-car-crash"></i> 10. Accidents &amp; Damage</h2>
            <p>If there is an accident, theft, vandalism, or significant damage:</p>
            <ol>
                <li>Make sure everyone is safe. If anyone is hurt, call 911.</li>
                <li>Report it to the police whenever North Carolina law requires, and always for theft or vandalism. Get the report number.</li>
                <li>Call us as soon as it is safe to do so.</li>
                <li>Do not admit fault, make any payment, or sign anything on our behalf.</li>
                <li>Take photos of the scene and the damage, and get the names, phone numbers, insurance details, and license plates of everyone involved, plus any witnesses.</li>
            </ol>
            <p>Please cooperate with any insurance claim and give truthful information. Not reporting an incident promptly can make you personally responsible for costs that insurance would otherwise have covered.</p>
        </div>

        <!-- Section 11 -->
        <div class="policy-section" id="cancellation">
            <h2><i class="fas fa-calendar-times"></i> 11. Cancellations &amp; Refunds</h2>
            <p>If you have reserved but not paid, you can cancel at any time at no cost — let us know, or simply let the hold run out.</p>
            <p>If you have already paid the rental charge:</p>
            <table class="fees-table">
                <thead>
                    <tr><th>When you cancel</th><th>Refund of the rental charge</th></tr>
                </thead>
                <tbody>
                    <tr><td>More than 72 hours before pickup</td><td class="fee-amount">Full refund</td></tr>
                    <tr><td>24 to 72 hours before pickup</td><td class="fee-amount">50% refund</td></tr>
                    <tr><td>Less than 24 hours before pickup</td><td class="fee-amount">No refund</td></tr>
                    <tr><td>No-show (you do not pick up the vehicle)</td><td class="fee-amount">No refund</td></tr>
                </tbody>
            </table>
            <p>The security deposit is only taken at pickup, so there is no deposit to refund if you cancel before then. If we have to cancel your rental — for example, because the vehicle becomes unavailable — you get a full refund of everything you paid. Refunds go back to the payment method you used.</p>
        </div>

        <!-- Section 12 -->
        <div class="policy-section" id="return">
            <h2><i class="fas fa-undo"></i> 12. Returning the Vehicle</h2>
            <p>Return the vehicle to the location agreed when you booked, during our business hours (shown below), unless we have arranged something different with you in advance.</p>
            <ul>
                <li>We inspect the vehicle with you when you return it, and compare it with the record from pickup.</li>
                <li>Any new damage is assessed and taken from your deposit, or billed to you if it costs more than the deposit.</li>
                <li>Please be there for the return inspection. If you are not, our assessment will stand.</li>
                <li>Remove all your belongings. We are not responsible for items left in the vehicle.</li>
            </ul>
            <p>Once the vehicle is returned and any charges are settled, your deposit is released as described in Section 5.</p>
        </div>

        <!-- Section 13 -->
        <div class="policy-section" id="law">
            <h2><i class="fas fa-balance-scale"></i> 13. Governing Law</h2>
            <p>Rentals in Greensboro are governed by the laws of the State of North Carolina, except where another rule is required by law.</p>
        </div>`,
};
