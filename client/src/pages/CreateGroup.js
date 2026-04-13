import React, { useState, useEffect } from 'react';
import { NavBar } from "../components/NavBar";
import { Formik, Form, Field, ErrorMessage } from 'formik';
import { useNavigate } from 'react-router-dom';
import './CreateGroup.css'
import api from '../api';
import * as Yup from 'yup';
import { useLocation } from 'react-router-dom';

export const CreateGroup = () => {
    const [userData, setUserData] = useState({ name: '', email: '', picture: '' });
    const [userId, setUserId] = useState(null);

    let navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Check local storage first
        const storedUserData = localStorage.getItem('userData');
        if (storedUserData) {
            const user = JSON.parse(storedUserData);
            setUserData(user);
            fetchUserId(user.email);
        } else if (location.state) {
            // If not in local storage, use location state and update local storage
            const { name, email, picture } = location.state;
            setUserData({ name, email, picture });
            localStorage.setItem('userData', JSON.stringify({ name, email, picture }));
            fetchUserId(email);
        }
    }, [location.state]);
    const fetchUserId = (email) => {
        if (email) {
            api.get(`/users/byEmail/${email}`)
                .then((res) => {
                    setUserId(res.data.id);
                })
                .catch(error => console.error('Error fetching userId:', error));
        }
    };
    // const navigate = useNavigate();
    const initialValues = {
        groupName: "",
        major: "",
        subject: "",
        gradeLevel: "",
        leader: "",
        maxParticipants: "5",
        isPublic: "true",
        password: ""
    }

    // const onSubmit = (data) => {
    //     axios.post('http://localhost:3001/groups', data).then((res) => {
    //         console.log(res.data);
    //         navigate(`/group/${res.data}`);
    //     })
    // }
    const onSubmit = async (data) => {
        try {
            if (!userId) {
                console.error("User ID is missing");
                return;
            }
            // Post to create group
            const payload = {
                ...data,
                leader: userId, // Set current user as leader
                isPublic: data.isPublic === "true",
                maxParticipants: parseInt(data.maxParticipants, 10)
            };
            const response = await api.post('/groups', payload);
            const groupId = response.data.id;

            if (!groupId) {
                throw new Error("Group ID not returned from server. Check server/routes/Groups.js");
            }
            // const userId = "1";
            await api.post(`/groupsUsers/user/${userId}/group/${groupId}`);

            // Navigate
            navigate(`/group/${groupId}`);
        } catch (error) {
            console.error('Error creating group:', error);
        }
    }

    const validationSchema = Yup.object().shape({
        groupName: Yup.string().required('You must input a group name!'),
        major: Yup.string(),
        subject: Yup.string(),
        gradeLevel: Yup.string(),
        leader: Yup.string(),
        maxParticipants: Yup.number().typeError('Must be a number').min(2, "At least 2 participants").required("Required"),
        isPublic: Yup.string().required(),
        password: Yup.string().when('isPublic', {
            is: "false",
            then: () => Yup.string().required('Password is required for private groups'),
            otherwise: () => Yup.string().notRequired()
        })
    })

    return (
        <div className="create-group-page">
            <NavBar />
            <div className="create-group-container">
                <h2 className="page-title">Create Study Room</h2>
                <Formik
                    initialValues={initialValues}
                    onSubmit={onSubmit}
                    validationSchema={validationSchema}>
                    {({ values }) => (
                        <Form>
                            <div className="form-group">
                                <label>Group Name</label>
                                <Field className="form-input" name="groupName" placeholder="e.g. Calculus 101 Study Group" />
                                <ErrorMessage name="groupName" component="span" className="error-message" />
                            </div>

                            <div className="form-group">
                                <label>Major</label>
                                <Field className="form-input" name="major" placeholder="e.g. Computer Science" />
                            </div>

                            <div className="form-group">
                                <label>Subject</label>
                                <Field className="form-input" name="subject" placeholder="e.g. Mathematics" />
                            </div>

                            <div className="form-group">
                                <label>Grade Level</label>
                                <Field className="form-input" name="gradeLevel" placeholder="e.g. Sophomore" />
                            </div>

                            <div className="form-group">
                                <label>Max Participants</label>
                                <Field className="form-input" type="number" name="maxParticipants" placeholder="e.g. 5" />
                                <ErrorMessage name="maxParticipants" component="span" className="error-message" />
                            </div>

                            <div className="form-group">
                                <label>Privacy</label>
                                <div className="radio-group">
                                    <label className="radio-label">
                                        <Field type="radio" name="isPublic" value="true" />
                                        Public
                                    </label>
                                    <label className="radio-label">
                                        <Field type="radio" name="isPublic" value="false" />
                                        Private
                                    </label>
                                </div>
                            </div>

                            {values.isPublic === "false" && (
                                <div className="form-group">
                                    <label>Room Password</label>
                                    <Field className="form-input" type="password" name="password" placeholder="Set a password" />
                                    <ErrorMessage name="password" component="span" className="error-message" />
                                </div>
                            )}

                            <button className="submit-btn" type="submit">Create Room</button>
                        </Form>
                    )}
                </Formik>
            </div>
        </div>
    );
}