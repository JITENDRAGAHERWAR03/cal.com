import type { RenderResult } from "@testing-library/react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { Host, TeamMember } from "@calcom/features/eventtypes/lib/types";
import type { AddMembersWithSwitchProps } from "../AddMembersWithSwitch";
import { AddMembersWithSwitch, mapOptionsToHosts } from "../AddMembersWithSwitch";

// Mock matchMedia
vi.mock("@formkit/auto-animate/react", () => ({
  useAutoAnimate: () => [null],
}));

// Mock Segment component
vi.mock("@calcom/features/Segment", () => ({
  Segment: vi.fn().mockImplementation(({ onQueryValueChange }) => (
    <div data-testid="mock-segment">
      <button onClick={() => onQueryValueChange({ queryValue: { id: "test" } })}>Update Query</button>
    </div>
  )),
}));

const mockTeamMembers: TeamMember[] = [
  {
    value: "1",
    label: "John Doe",
    avatar: "avatar1.jpg",
    email: "john@example.com",
    defaultScheduleId: 1,
  },
  {
    value: "2",
    label: "Jane Smith",
    avatar: "avatar2.jpg",
    email: "jane@example.com",
    defaultScheduleId: 2,
  },
];

const mockInviteMemberMutateAsync = vi.fn();
const mockListMembersFetch = vi.fn();

// Mock trpc
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      viewer: {
        appRoutingForms: {
          getAttributesForTeam: {
            prefetch: vi.fn(),
          },
        },
        teams: {
          listMembers: {
            fetch: mockListMembersFetch,
          },
        },
      },
    }),
    viewer: {
      teams: {
        inviteMember: {
          useMutation: () => ({
            mutateAsync: mockInviteMemberMutateAsync,
          }),
        },
      },
    },
  },
}));

interface DefaultFormValues {
  assignRRMembersUsingSegment: boolean;
  rrSegmentQueryValue: null;
  hosts: Host[];
}

const defaultFormValues: DefaultFormValues = {
  assignRRMembersUsingSegment: false,
  rrSegmentQueryValue: null,
  hosts: [],
};

const renderComponent = ({
  componentProps,
  formDefaultValues = defaultFormValues,
}: {
  componentProps: AddMembersWithSwitchProps;
  formDefaultValues?: DefaultFormValues;
}): RenderResult => {
  const Wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => {
    const methods = useForm({
      defaultValues: formDefaultValues,
    });
    // Use the initial value from componentProps to properly test different states
    const [assignAllTeamMembers, setAssignAllTeamMembers] = React.useState(
      componentProps.assignAllTeamMembers
    );
    return (
      <FormProvider {...methods}>
        {React.cloneElement(children as React.ReactElement, {
          assignAllTeamMembers,
          setAssignAllTeamMembers,
        })}
      </FormProvider>
    );
  };

  return render(<AddMembersWithSwitch {...componentProps} />, { wrapper: Wrapper });
};

describe("AddMembersWithSwitch", () => {
  const defaultProps = {
    teamMembers: mockTeamMembers,
    value: [] as Host[],
    onChange: vi.fn(),
    onActive: vi.fn(),
    isFixed: false,
    teamId: 1,
    setAssignAllTeamMembers: vi.fn(),
    groupId: null,
    assignAllTeamMembers: false,
    automaticAddAllEnabled: false,
  };

  it("should render in TOGGLES_OFF_AND_ALL_TEAM_MEMBERS_NOT_APPLICABLE state", () => {
    renderComponent({
      componentProps: {
        ...defaultProps,
        assignAllTeamMembers: false,
        isSegmentApplicable: false,
        automaticAddAllEnabled: false,
      },
    });
    expect(screen.queryByTestId("assign-all-team-members-toggle")).not.toBeInTheDocument();
    expectManualHostListToBeThere();
  });

  it("should render in TOGGLES_OFF_AND_ALL_TEAM_MEMBERS_APPLICABLE state", () => {
    renderComponent({
      componentProps: {
        ...defaultProps,
        assignAllTeamMembers: false,
        isSegmentApplicable: false,
        automaticAddAllEnabled: true,
      },
    });

    expect(screen.getByTestId("assign-all-team-members-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("assign-all-team-members-toggle").getAttribute("aria-checked")).toBe("false");
    expectManualHostListToBeThere();
  });

  it("should render in ALL_TEAM_MEMBERS_ENABLED_AND_SEGMENT_NOT_APPLICABLE state", () => {
    renderComponent({
      componentProps: {
        ...defaultProps,
        assignAllTeamMembers: true,
        isSegmentApplicable: false,
        automaticAddAllEnabled: true,
      },
      formDefaultValues: {
        assignRRMembersUsingSegment: true,
        rrSegmentQueryValue: null,
        hosts: [],
      },
    });

    // In this state, the toggle should be present (to allow turning it off) and checked
    expect(screen.getByTestId("assign-all-team-members-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("assign-all-team-members-toggle").getAttribute("aria-checked")).toBe("true");
    // Segment toggle should NOT be present since isSegmentApplicable is false
    expect(screen.queryByTestId("segment-toggle")).not.toBeInTheDocument();
  });

  it("should render segment toggle in enabled state when isSegmentApplicable is true and assignRRMembersUsingSegment is also true(even if assignAllTeamMembers is false)", () => {
    renderComponent({
      componentProps: {
        ...defaultProps,
        assignAllTeamMembers: false,
        isSegmentApplicable: true,
        automaticAddAllEnabled: true,
      },
      formDefaultValues: {
        assignRRMembersUsingSegment: true,
        rrSegmentQueryValue: null,
        hosts: [],
      },
    });

    expect(screen.getByTestId("segment-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("segment-toggle").getAttribute("aria-checked")).toBe("true");
  });

  it("should call onChange when team members are selected", async () => {
    renderComponent({ componentProps: defaultProps });

    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent.click(screen.getByText("John Doe"));

    await waitFor(() => {
      expect(defaultProps.onChange).toHaveBeenCalled();
    });
  });

  it("resolves invite options to numeric hosts via invite mutation", async () => {
    mockInviteMemberMutateAsync.mockResolvedValue({ numUsersInvited: 1 });
    mockListMembersFetch.mockResolvedValue({
      members: [
        {
          id: 123,
          email: "new-user@example.com",
          username: "new-user",
          name: "New User",
          avatarUrl: null,
        },
      ],
    });

    renderComponent({ componentProps: defaultProps });

    const combobox = screen.getByRole("combobox");
    fireEvent.change(combobox, { target: { value: "new-user@example.com" } });
    fireEvent.keyDown(combobox, { key: "Enter" });

    await waitFor(() => {
      expect(mockInviteMemberMutateAsync).toHaveBeenCalled();
      expect(defaultProps.onChange).toHaveBeenCalledWith([
        {
          isFixed: false,
          userId: 123,
          priority: 2,
          weight: 100,
          scheduleId: null,
          groupId: null,
        },
      ]);
    });
  });

  it("should show Segment when 'Automatically add all team members' is toggled on and then segment toggle is switched on", () => {
    // Start with assignAllTeamMembers: false to test the flow of enabling it
    renderComponent({
      componentProps: {
        ...defaultProps,
        assignAllTeamMembers: false,
        isSegmentApplicable: true,
        automaticAddAllEnabled: true,
      },
      formDefaultValues: {
        assignRRMembersUsingSegment: false,
        rrSegmentQueryValue: null,
        hosts: [],
      },
    });

    // Initially, segment toggle should not be visible (assignAllTeamMembers is false)
    expect(screen.queryByTestId("segment-toggle")).not.toBeInTheDocument();

    // Click to enable "assign all team members"
    act(() => {
      screen.getByTestId("assign-all-team-members-toggle").click();
    });

    // Now segment toggle should be visible, but segment content should not be visible yet
    expect(screen.queryByTestId("mock-segment")).not.toBeInTheDocument();

    // Click segment toggle to enable it
    act(() => {
      screen.getByTestId("segment-toggle").click();
    });

    // Now segment content should be visible
    expect(screen.getByTestId("mock-segment")).toBeInTheDocument();
  });
});

function expectManualHostListToBeThere(): void {
  expect(screen.getByRole("combobox")).toBeInTheDocument();
}

describe("mapOptionsToHosts", () => {
  it("ignores invite options and invalid ids", () => {
    const hosts = mapOptionsToHosts({
      isFixed: false,
      options: [
        {
          value: "1",
          label: "John Doe",
          avatar: "avatar.jpg",
          groupId: null,
          priority: 4,
          weight: 50,
          defaultScheduleId: 3,
        },
        {
          value: "invite:new-user@example.com",
          label: "new-user@example.com (invite)",
          avatar: "",
          groupId: null,
          isEmailInvite: true,
          email: "new-user@example.com",
        },
        {
          value: "NaN",
          label: "Invalid",
          avatar: "",
          groupId: null,
        },
      ],
    });

    expect(hosts).toEqual([
      {
        isFixed: false,
        userId: 1,
        priority: 4,
        weight: 50,
        scheduleId: 3,
        groupId: null,
      },
    ]);
  });
});
