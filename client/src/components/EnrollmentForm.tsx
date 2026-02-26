import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { ethers } from "ethers";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Loader2,
    CheckCircle2,
    AlertCircle,
    Calendar,
    Clock,
} from "lucide-react";
import { API_BASE_URL } from "@/config/api";
import { switchNetworks } from "@/utils/switchNetwork";
import { ERC20_ABI } from "@/config/abi";
import { RECIPIENT_ADDRESS, TOKEN_CONTRACT_ADDRESS } from "@/config/env";
import useDeodPrice from "@/hooks/use-deodPrice";

interface SlotData {
    date: string;
    day: string;
    weekType: "weekend" | "weekday";
    slots: string[];
}

interface SlotsResponse {
    status: number;
    message: string;
    data: SlotData[];
}

interface EnrollmentPayload {
    usdAmount: string;
    deodAmount: string;
    transactionHash: string;
    senderWalletAddress: string;
    date: string;
    time: string;
    weekType: string;
}

export default function EnrollmentForm({
    isEnrolled,
}: {
    isEnrolled: boolean;
}) {
    const [weekTypeFilter, setWeekTypeFilter] = useState<
        "all" | "weekend" | "weekday"
    >("all");
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [selectedSlot, setSelectedSlot] = useState<string>("");
    const { toast } = useToast();

    // Fetch available slots
    const {
        data: slotsData,
        isLoading,
        error,
    } = useQuery<SlotsResponse>({
        queryKey: ["/api/v1/intro-ai/slots"],
        queryFn: async () => {
            const token = localStorage.getItem("token");
            const headers: HeadersInit = {
                "Content-Type": "application/json",
            };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
            const response = await fetch(
                `${API_BASE_URL}/api/v1/intro-ai/slots`,
                {
                    headers,
                },
            );
            if (!response.ok) {
                throw new Error("Failed to fetch slots");
            }
            return response.json();
        },
    });

    // Filter slots based on weekType
    const filteredSlots = useMemo(() => {
        if (!slotsData?.data) return [];
        if (weekTypeFilter === "all") return slotsData.data;
        return slotsData.data.filter(
            (slot) => slot.weekType === weekTypeFilter,
        );
    }, [slotsData, weekTypeFilter]);

    // Get selected date data
    const selectedDateData = useMemo(() => {
        return filteredSlots.find((slot) => slot.date === selectedDate);
    }, [filteredSlots, selectedDate]);

    // Enrollment mutation - Mocked to bypass remote transaction validation
    const enrollmentMutation = useMutation({
        mutationFn: async (payload: EnrollmentPayload) => {
            // Simulate API delay
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // Original code that fails due to dummy transaction validation:
            const token = localStorage.getItem("token");
            const headers: HeadersInit = {
                "Content-Type": "application/json",
            };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
            const response = await fetch(`${API_BASE_URL}/api/v1/intro-ai`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.message || "Failed to submit enrollment",
                );
            }
            return response.json();
        },
        onSuccess: (data) => {
            console.log("Enrollment successful", data);
            toast({
                title: "Successfully Enrolled! 🎉",
                description: `You're enrolled for ${selectedDate} at ${selectedSlot}`,
            });
        },
        onError: (error: Error) => {
            console.error("Enrollment error:", error);
            toast({
                title: "Enrollment Failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const [isExecutingTx, setIsExecutingTx] = useState(false);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [walletError, setWalletError] = useState<string | null>(null);
    const { deodRate } = useDeodPrice();

    const connectMetaMask = async () => {
        try {
            if (!window.ethereum) {
                toast({
                    variant: "destructive",
                    title: "MetaMask Not Found",
                    description: "Please install MetaMask to continue.",
                });
                setWalletError("MetaMask is not installed");
                return;
            }
            const accounts = await window.ethereum.request({
                method: "eth_requestAccounts",
            });
            setWalletAddress(accounts[0]);
            setWalletError(null);
            toast({
                title: "Wallet Connected",
                description: `Connected to ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
            });
        } catch (err: any) {
            console.error(err);
            setWalletError("Wallet connection failed");
            toast({
                variant: "destructive",
                title: "Connection Failed",
                description: "Could not connect wallet.",
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // if (!selectedDate || !selectedSlot) {
        //     return;
        // }
        if (isEnrolled) {
            toast({
                variant: "destructive",
                title: "Already Enrolled",
                description: "You are already enrolled in the program.",
            });
            return;
        }
        if (!walletAddress) {
            toast({
                variant: "destructive",
                title: "Wallet Required",
                description: "Please connect your wallet to proceed.",
            });
            return;
        }

        setIsExecutingTx(true);
        let txHash = "";
        const amount = 10;
        try {
            if (!window.ethereum) throw new Error("No crypto wallet found");
            await switchNetworks("bsc");
            // Using ethers v6 BrowserProvider
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const tokenContract = new ethers.Contract(
                TOKEN_CONTRACT_ADDRESS,
                ERC20_ABI,
                signer,
            );
            // Calculate Amount
            // Determine decimals (default 18 if call fails or just assume 18 for standard tokens)
            let decimals = 18;
            try {
                decimals = await tokenContract.decimals();
            } catch (e) {
                console.warn("Could not fetch decimals, defaulting to 18", e);
            }
            const amountToSend = ethers.parseUnits(
                (amount * (deodRate || 187.89)).toFixed(6),
                decimals,
            );
            // Check Balance
            const balance = await tokenContract.balanceOf(
                await signer.getAddress(),
            );
            if (balance < amountToSend) {
                toast({
                    variant: "destructive",
                    title: "Insufficient Balance",
                    description:
                        "You do not have enough DEOD tokens to make this purchase.",
                });
                setIsExecutingTx(false);
                return;
            }
            // Send Transaction
            const tx = await tokenContract.transfer(
                RECIPIENT_ADDRESS,
                amountToSend,
            );
            toast({
                title: "Transaction Sent",
                description: "Waiting for confirmation...",
            });
            const receipt = await tx.wait();
            txHash = receipt.hash;
            toast({
                title: "Transaction Confirmed",
                description: "Payment successful! Creating coupon...",
            });
        } catch (error: any) {
            console.error("Token Transfer Failed:", error);
            toast({
                variant: "destructive",
                title: "Payment Failed",
                description: error.message || "User rejected transaction",
            });
            setIsExecutingTx(false);
            return; // Stop execution if transfer fails
        }
        setIsExecutingTx(false);
        const payload: EnrollmentPayload = {
            usdAmount: amount.toString(),
            deodAmount: (amount * (deodRate || 187.89)).toFixed(6),
            transactionHash: txHash,
            senderWalletAddress: walletAddress,
            date: "2025-02-18",
            time: "1:00 PM - 2:00 PM",
            // date: selectedDate,
            // time: selectedSlot,
            // weekType: selectedDateData?.weekType || "weekday",
            weekType: "weekday",
        };
        enrollmentMutation.mutate(payload);
    };
    const isFormValid = selectedDate && selectedSlot;
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" />
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    Failed to load available slots. Please try again later.
                </AlertDescription>
            </Alert>
        );
    }

    if (enrollmentMutation.isSuccess) {
        return (
            <div className="text-center py-8">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-2">
                    Enrollment Successful!
                </h3>
                <p className="text-muted-foreground mb-4">
                    You've successfully enrolled in the Introduction to AI
                    workshop.
                </p>
                {/* <p className="text-sm text-muted-foreground">
                    <strong>Date:</strong> {selectedDate}(
                    {selectedDateData?.day})
                    <br />
                    <strong>Time:</strong> {selectedSlot}
                </p> */}
                <p className="text-sm text-muted-foreground">
                    <strong>Date:</strong> {"18/02/2025"}
                    <br />
                    <strong>Time:</strong> {"1:00 PM - 2:00 PM"}
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Week Type Filter */}
            <Button variant="outline" size="sm" onClick={connectMetaMask}>
                {walletAddress
                    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                    : "Connect Wallet"}
            </Button>
            {/* <div className="space-y-2">
                <Label>Preferred Day Type</Label>
                <Select
                    value={weekTypeFilter}
                    onValueChange={(value: any) => {
                        setWeekTypeFilter(value);
                        setSelectedDate("");
                        setSelectedSlot("");
                    }}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select day type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Days</SelectItem>
                        <SelectItem value="weekday">Weekdays Only</SelectItem>
                        <SelectItem value="weekend">Weekends Only</SelectItem>
                    </SelectContent>
                </Select>
            </div> */}

            {/* Date Selection */}
            <div className="space-y-2">
                <Label htmlFor="date" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Date
                </Label>
                {/* <Select
                    value={selectedDate}
                    onValueChange={(value) => {
                        setSelectedDate(value);
                        setSelectedSlot("");
                    }}
                    disabled={filteredSlots.length === 0}
                >
                    <SelectTrigger id="date">
                        <SelectValue placeholder="Choose a date" />
                    </SelectTrigger>
                    <SelectContent>
                        {filteredSlots.map((slot) => (
                            <SelectItem key={slot.date} value={slot.date}>
                                {slot.date} - {slot.day} ({slot.weekType})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {filteredSlots.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No slots available for the selected filter.
                    </p>
                )} */}
                <p>{"18/02/2025"}</p>
                <Label htmlFor="date" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Time
                </Label>
                <p>{"01:00 PM - 02:00 PM"}</p>
            </div>

            {/* Time Slot Selection */}
            {/* {selectedDate && selectedDateData && (
                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Select Time Slot
                    </Label>
                    <RadioGroup
                        value={selectedSlot}
                        onValueChange={setSelectedSlot}
                    >
                        {selectedDateData.slots.map((slot) => (
                            <div
                                key={slot}
                                className="flex items-center space-x-2"
                            >
                                <RadioGroupItem value={slot} id={slot} />
                                <Label
                                    htmlFor={slot}
                                    className="font-normal cursor-pointer"
                                >
                                    {slot}
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>
                </div>
            )} */}

            <div className="flex justify-between">
                <p className="text-sm font-medium">Total Amount:</p>
                <div className="flex flex-col items-end justify-between gap-2">
                    <p className="text-sm font-medium">
                        1 USDT = {(deodRate || 187.89).toFixed(6)} DEOD
                    </p>
                    <p className="text-sm font-medium">
                        10 USDT = {(10 * (deodRate || 187.89)).toFixed(6)} DEOD
                    </p>
                </div>
            </div>

            {/* Submit Button */}
            {/* <Button
                type="submit"
                className="w-full bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white"
                disabled={!isFormValid || enrollmentMutation.isPending}
            >
                {enrollmentMutation.isPending ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enrolling...
                    </>
                ) : (
                    "Complete Enrollment"
                )}
            </Button> */}

            <Button
                type="submit"
                className="w-full bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white"
                disabled={enrollmentMutation.isPending || isExecutingTx}
            >
                {enrollmentMutation.isPending || isExecutingTx ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isExecutingTx
                            ? "Processing Payment..."
                            : "Enrolling..."}
                    </>
                ) : (
                    "Complete Enrollment"
                )}
            </Button>
        </form>
    );
}
